import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from './jobs/jobs.module';
import { ConfigModule } from './config/config.module';
import { APP_CONFIG, AppConfig } from './config/app-config';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: (appConfig: AppConfig) => ({ uri: appConfig.mongoUri }),
    }),
    JobsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
