import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, dbConfig, redisConfig, kafkaConfig, jwtConfig, apiConfig } from '@exchange/config';
import { createServiceLogger } from '@exchange/logger';
import { initDb, closeDb } from './db/index.js';
import { initRedis, disconnectRedis } from '@exchange/redis';
import { initKafka, disconnectKafka } from '@exchange/kafka';
import { errorHandler } from './middleware/errorHandler.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createAuthRouter } from './auth/routes.js';
import { createAccountRouter } from './account/routes.js';
import { createOrdersRouter } from './orders/routes.js';
import { createMarketsRouter } from './markets/routes.js';

const logger = createServiceLogger('api-gateway');

async function main() {
  logger.info('Starting API Gateway...');

  initDb(dbConfig.connectionString, dbConfig.max);
  initRedis(redisConfig);
  initKafka(kafkaConfig);

  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
  });
  app.use('/api', limiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const authMiddleware = createAuthMiddleware(jwtConfig.secret);

  app.use('/api/v1/auth', createAuthRouter(jwtConfig.secret, jwtConfig.expiresIn));
  app.use('/api/v1/account', authMiddleware, createAccountRouter());
  app.use('/api/v1/orders', authMiddleware, createOrdersRouter());
  app.use('/api/v1/markets', createMarketsRouter());

  app.use(errorHandler);

  const server = app.listen(apiConfig.port, apiConfig.host, () => {
    logger.info({ port: apiConfig.port, host: apiConfig.host }, 'API Gateway started');
  });

  const shutdown = async () => {
    logger.info('Shutting down API Gateway...');
    server.close();
    await disconnectKafka();
    await disconnectRedis();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ error: err }, 'Failed to start API Gateway');
  process.exit(1);
});
