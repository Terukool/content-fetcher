import { Injectable } from '@nestjs/common';
import { JobContentsRepository } from './job-contents.repository';
import { JobContent } from './job-contents.schema';

@Injectable()
export class JobContentsService {
  public constructor(private readonly _repository: JobContentsRepository) {}

  public async upsertMany(
    jobId: string,
    items: Pick<JobContent, 'urlHash' | 'content'>[],
  ): Promise<void> {
    await this._repository.upsertMany(jobId, items);
  }

  public async getContent(
    jobId: string,
    urlHash: string,
  ): Promise<string | null> {
    return this._repository.findContent(jobId, urlHash);
  }
}
