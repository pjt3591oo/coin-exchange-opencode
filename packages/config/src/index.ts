import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });
dotenvConfig({ path: resolve(process.cwd(), '..', '..', '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(20),
  
  REDIS_URL: z.string().url(),
  
  KAFKA_BROKERS: z.string().transform(s => s.split(',')),
  KAFKA_CLIENT_ID: z.string().default('exchange'),
  
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  
  WS_PORT: z.coerce.number().int().positive().default(3001),
  WS_HOST: z.string().default('0.0.0.0'),
  
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const config = loadConfig();

export const dbConfig = {
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_SIZE,
};

export const redisConfig = {
  url: config.REDIS_URL,
};

export const kafkaConfig = {
  brokers: config.KAFKA_BROKERS,
  clientId: config.KAFKA_CLIENT_ID,
};

export const jwtConfig = {
  secret: config.JWT_SECRET,
  expiresIn: config.JWT_EXPIRES_IN,
};

export const apiConfig = {
  port: config.API_PORT,
  host: config.API_HOST,
};

export const wsConfig = {
  port: config.WS_PORT,
  host: config.WS_HOST,
};

export const logConfig = {
  level: config.LOG_LEVEL,
  format: config.LOG_FORMAT,
};
