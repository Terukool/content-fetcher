import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, JobStatus, UrlResult } from './job.schema';

export interface JobUpdatePayload {
  urlHash: string;
  patch: Partial<UrlResult>;
}

@Injectable()
export class JobsRepository {
  constructor(
    @InjectModel(Job.name) private readonly _model: Model<JobDocument>,
  ) {}

  async bulkUpdateResults(
    jobId: string,
    updates: JobUpdatePayload[],
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

    await this._model.bulkWrite(operations, { ordered: false });
  }

  async createJob(initialState: UrlResult[]): Promise<string> {
    const job = await this._model.create({
      status: JobStatus.PENDING,
      results: initialState,
    });

    return job._id.toString();
  }

  async setJobStatus(jobId: string, status: JobStatus): Promise<void> {
    await this._model.updateOne({ _id: new Types.ObjectId(jobId) }, { status });
  }

  async findJobById(jobId: string): Promise<JobDocument | null> {
    return this._model.findById(new Types.ObjectId(jobId)).exec();
  }

  async findJobUrlResult(
    jobId: string,
    urlHash: string,
  ): Promise<{ jobExists: boolean; result: UrlResult | null }> {
    const jobObjectId = new Types.ObjectId(jobId);
    const job = await this._model
      .findById(jobObjectId, { results: 1 })
      .lean()
      .exec();

    if (!job) {
      return { jobExists: false, result: null };
    }

    const result =
      job.results?.find((r: UrlResult) => r.urlHash === urlHash) ?? null;
    return { jobExists: true, result };
  }
}
