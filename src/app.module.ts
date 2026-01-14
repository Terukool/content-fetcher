import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from './jobs/jobs.module';
import { ConfigModule } from './config/config.module';
import { AppConfig } from './config/config';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfig],
      useFactory: (appConfig: AppConfig) => ({ uri: appConfig.mongoUri }),
    }),
    JobsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
