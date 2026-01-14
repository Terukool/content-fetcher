import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobContent, JobContentSchema } from './job-contents.schema';
import { JobContentsRepository } from './job-contents.repository';
import { JobContentsService } from './job-contents.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobContent.name, schema: JobContentSchema },
    ]),
  ],
  providers: [JobContentsRepository, JobContentsService],
  exports: [JobContentsService],
})
export class JobContentsModule {}
