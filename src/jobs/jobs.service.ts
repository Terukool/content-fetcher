import { Injectable, NotFoundException } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { JobRunnerService } from './job-runner.service';
import { JobDocument, UrlResult, UrlResultStatus } from './job.schema';
import { generateUrlHash } from './utils/url-hash.util';
import { JobContentsService } from '../job-contents/job-contents.service';

type FullUrlResult = UrlResult & { content: string | null };

@Injectable()
export class JobsService {
  constructor(
    private readonly _repository: JobsRepository,
    private readonly _jobRunnerService: JobRunnerService,
    private readonly _jobsContentService: JobContentsService,
  ) {}

  async createJob(urls: string[]): Promise<string> {
    const urlsWithHashes = urls.map((url) => ({
      url,
      urlHash: generateUrlHash(url),
    }));

    const initialResults: UrlResult[] = urlsWithHashes.map(
      ({ url, urlHash }) => ({
        url,
        urlHash,
        status: UrlResultStatus.PENDING,
        redirects: [],
        truncated: false,
      }),
    );

    const jobId = await this._repository.createJob(initialResults);

    // Run in-process, this can be replaced by a message queue in the future
    this._jobRunnerService.run(jobId, urlsWithHashes).catch((error) => {
      console.error(`Job ${jobId} runner failed:`, error);
    });

    return jobId;
  }

  async getJob(jobId: string): Promise<JobDocument> {
    const job = await this._repository.findJobById(jobId);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }

  async getFullUrlResult(
    jobId: string,
    urlHash: string,
  ): Promise<FullUrlResult> {
    const { jobExists, result } = await this._repository.findJobUrlResult(
      jobId,
      urlHash,
    );

    if (!jobExists) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (!result) {
      throw new NotFoundException(
        `URL with hash ${urlHash} not found in job ${jobId}`,
      );
    }

    const content = await this._jobsContentService.getContent(jobId, urlHash);
    return { ...result, content };
  }
}
