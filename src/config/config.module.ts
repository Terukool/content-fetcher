import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './app-config';

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsv = (value: string | undefined): string[] => {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const createAppConfig = (): AppConfig => {
  return {
    mongoUri:
      process.env.MONGO_URI ?? 'mongodb://localhost:27017/content-fetcher',
    maxUrlsPerJob: parseNumber(process.env.MAX_URLS_PER_JOB, 10),
    concurrency: parseNumber(process.env.CONCURRENCY, 5),
    mongoBatchTimeMs: parseNumber(process.env.MONGO_BATCH_TIME_MS, 250),
    mongoBatchSize: parseNumber(process.env.MONGO_BATCH_SIZE, 10),
    timeoutMs: parseNumber(process.env.TIMEOUT_MS, 10_000),
    maxRedirects: parseNumber(process.env.MAX_REDIRECTS, 5),
    maxBytes: parseNumber(process.env.MAX_BYTES, 1024 * 1024 * 3), // 3MB
    previewChars: parseNumber(process.env.PREVIEW_CHARS, 500),
    port: parseNumber(process.env.PORT, 3000),
    hostsBlacklist: [
      // block localhost variants
      'localhost',
      '127.0.0.1',
      '::1',
      '0.0.0.0',
      ...parseCsv(process.env.HOSTS_BLACKLIST),
    ],
  };
};

@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: createAppConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
