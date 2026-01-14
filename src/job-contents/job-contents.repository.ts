import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobContent, JobContentDocument } from './job-contents.schema';

@Injectable()
export class JobContentsRepository {
  constructor(
    @InjectModel(JobContent.name)
    private readonly _model: Model<JobContentDocument>,
  ) {}

  async upsertMany(
    jobId: string,
    items: Pick<JobContent, 'urlHash' | 'content'>[],
  ): Promise<void> {
    if (items.length === 0) return;

    const jobObjectId = new Types.ObjectId(jobId);

    const operations = items.map(({ urlHash, content }) => ({
      updateOne: {
        filter: { jobId: jobObjectId, urlHash },
        update: { $set: { jobId: jobObjectId, urlHash, content } },
        upsert: true,
      },
    }));

    await this._model.bulkWrite(operations, { ordered: false });
  }

  async findContent(jobId: string, urlHash: string): Promise<string | null> {
    const jobObjectId = new Types.ObjectId(jobId);
    const doc = await this._model
      .findOne({ jobId: jobObjectId, urlHash }, { content: 1 })
      .lean()
      .exec();
    return doc?.content ?? null;
  }
}
