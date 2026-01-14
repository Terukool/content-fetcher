import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobRunnerService } from './job-runner.service';
import { UrlFetcherService } from './url-fetcher.service';
import { UrlValidatorService } from './url-validator.service';
import { JobsRepository } from './jobs.repository';
import { Job, JobSchema } from './job.schema';
import { ConfigModule } from '../config/config.module';
import { JobContentsModule } from '../job-contents/job-contents.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    JobContentsModule,
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobRunnerService,
    UrlFetcherService,
    UrlValidatorService,
    JobsRepository,
  ],
})
export class JobsModule {}
