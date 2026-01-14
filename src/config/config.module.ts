import { Module } from '@nestjs/common';
import { dotenvLoader, TypedConfigModule } from 'nest-typed-config';
import { AppConfig } from './config';

const envKeyToConfigKey = (key: string): string => {
  const upper = key.toUpperCase();

  const camelCasedKey = upper
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

  return camelCasedKey;
};

@Module({
  imports: [
    TypedConfigModule.forRoot({
      schema: AppConfig,
      load: dotenvLoader({
        keyTransformer: envKeyToConfigKey,
      }),
    }),
  ],
  exports: [TypedConfigModule],
})
export class ConfigModule {}
