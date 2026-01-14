import { Injectable, NotFoundException } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { JobRunnerService } from './job-runner.service';
import { JobDocument, UrlResult, UrlResultStatus } from './job.schema';
import { generateUrlHash } from './utils/url-hash.util';

@Injectable()
export class JobsService {
  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly jobRunnerService: JobRunnerService,
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

    const jobId = await this.jobsRepository.createJob(initialResults);

    this.jobRunnerService.run(jobId, urlsWithHashes).catch((error) => {
      console.error(`Job ${jobId} runner failed:`, error);
    });

    return jobId;
  }

  async getJob(jobId: string): Promise<JobDocument> {
    const job = await this.jobsRepository.findJobById(jobId);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }

  async getUrlContent(jobId: string, urlHash: string): Promise<UrlResult> {
    const { jobExists, result } = await this.jobsRepository.findJobUrlContent(
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

    return result;
  }
}
