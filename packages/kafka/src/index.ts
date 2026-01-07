import { Kafka, Producer, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { createServiceLogger } from '@exchange/logger';

const logger = createServiceLogger('kafka');

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
}

let kafka: Kafka | null = null;
let producer: Producer | null = null;

export function initKafka(config: KafkaConfig): Kafka {
  kafka = new Kafka({
    clientId: config.clientId,
    brokers: config.brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  });
  return kafka;
}

export function getKafka(): Kafka {
  if (!kafka) {
    throw new Error('Kafka not initialized. Call initKafka() first.');
  }
  return kafka;
}

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    const k = getKafka();
    producer = k.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await producer.connect();
    logger.info('Kafka producer connected');
  }
  return producer;
}

export async function publishMessage(
  topic: string,
  key: string,
  value: object
): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(value),
        timestamp: Date.now().toString(),
      },
    ],
  });
}

export async function publishMessages(
  topic: string,
  messages: Array<{ key: string; value: object }>
): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic,
    messages: messages.map(m => ({
      key: m.key,
      value: JSON.stringify(m.value),
      timestamp: Date.now().toString(),
    })),
  });
}

export interface ConsumerConfig {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
}

export type MessageHandler = (payload: EachMessagePayload) => Promise<void>;

export async function createConsumer(
  config: ConsumerConfig,
  handler: MessageHandler
): Promise<Consumer> {
  const k = getKafka();
  const consumer = k.consumer({
    groupId: config.groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  logger.info({ groupId: config.groupId }, 'Kafka consumer connected');

  await consumer.subscribe({
    topics: config.topics,
    fromBeginning: config.fromBeginning ?? false,
  });

  await consumer.run({
    eachMessage: async (payload) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error(
          { error, topic: payload.topic, partition: payload.partition },
          'Error processing Kafka message'
        );
        throw error;
      }
    },
  });

  return consumer;
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
  kafka = null;
  logger.info('Kafka disconnected');
}

export { Kafka, Producer, Consumer, EachMessagePayload };
