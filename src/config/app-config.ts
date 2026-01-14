import { Inject } from '@nestjs/common';

export type AppConfig = Readonly<{
  port: number;
  mongoUri: string;
  maxUrlsPerJob: number;
  concurrency: number;
  mongoBatchTimeMs: number;
  mongoBatchSize: number;
  timeoutMs: number;
  maxRedirects: number;
  maxBytes: number;
  previewChars: number;
  hostsBlacklist: string[];
}>;

export const APP_CONFIG = 'APP_CONFIG';
export const InjectAppConfig = (): ParameterDecorator => Inject(APP_CONFIG);
