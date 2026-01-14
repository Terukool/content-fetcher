import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, JobStatus, UrlResult } from './job.schema';

@Injectable()
export class JobsRepository {
  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<JobDocument>,
  ) {}

  async bulkUpdateResults(
    jobId: string,
    updates: Array<{ urlHash: string; patch: Partial<UrlResult> }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    const jobObjectId = new Types.ObjectId(jobId);

    const operations = updates.map(({ urlHash, patch }) => {
      const updateFields: Record<string, unknown> = {};

      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined) return;
        updateFields[`results.$.${key}`] = value;
      });

      return {
        updateOne: {
          filter: { _id: jobObjectId, 'results.urlHash': urlHash },
          update: { $set: updateFields },
        },
      };
    });

    await this.jobModel.bulkWrite(operations, { ordered: false });
  }

  async createJob(initialState: UrlResult[]): Promise<string> {
    const job = await this.jobModel.create({
      status: JobStatus.PENDING,
      results: initialState,
    });

    return job._id.toString();
  }

  async setJobStatus(jobId: string, status: JobStatus): Promise<void> {
    await this.jobModel.updateOne(
      { _id: new Types.ObjectId(jobId) },
      { status },
    );
  }

  async findJobById(jobId: string): Promise<JobDocument | null> {
    return this.jobModel.findById(new Types.ObjectId(jobId)).exec();
  }

  async findJobUrlContent(
    jobId: string,
    urlHash: string,
  ): Promise<{ jobExists: boolean; result: UrlResult | null }> {
    const jobObjectId = new Types.ObjectId(jobId);

    const [doc] = await this.jobModel
      .aggregate<{ result?: UrlResult }>([
        { $match: { _id: jobObjectId } },
        {
          $project: {
            result: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: '$results',
                    as: 'r',
                    cond: { $eq: ['$$r.urlHash', urlHash] },
                  },
                },
                0,
              ],
            },
          },
        },
      ])
      .exec();

    if (!doc) {
      return { jobExists: false, result: null };
    }

    return { jobExists: true, result: doc.result ?? null };
  }
}
