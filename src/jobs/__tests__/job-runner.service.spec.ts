import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JobRunnerService } from '../job-runner.service';
import { JobsRepository } from '../jobs.repository';
import { UrlFetcherService, FetchResult } from '../url-fetcher.service';
import { JobStatus, UrlResultStatus } from '../job.schema';
import { AppConfig } from '../../config/config';
import { JobContentsService } from '../../job-contents/job-contents.service';

describe('JobRunnerService', () => {
  let service: JobRunnerService;

  const CONFIG: AppConfig = {
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/test',
    maxUrlsPerJob: 10,
    concurrentFetchRequests: 5,
    mongoBatchTimeMs: 10,
    mongoBatchSize: 10,
    timeoutMs: 1000,
    maxRedirects: 3,
    maxBytes: 1024 * 1024,
    previewChars: 10,
    hostsBlacklist: ['localhost'],
  };

  const jobRepository = {
    setJobStatus: vi.fn().mockResolvedValue(undefined),
    bulkUpdateResults: vi.fn().mockResolvedValue(undefined),
  };

  const jobContentsService = {
    upsertMany: vi.fn().mockResolvedValue(undefined),
  };

  const FETCH_OK: FetchResult = {
    success: true,
    httpStatus: 200,
    redirects: [],
    contentType: 'text/html',
    byteLength: 100,
    truncated: false,
    contentPreview: 'test',
    content: 'test content',
  };

  const urlFetcherService = {
    fetch: vi.fn().mockResolvedValue(FETCH_OK),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobRunnerService,
        { provide: JobsRepository, useValue: jobRepository },
        { provide: UrlFetcherService, useValue: urlFetcherService },
        { provide: JobContentsService, useValue: jobContentsService },
        { provide: AppConfig, useValue: CONFIG },
      ],
    }).compile();

    service = module.get<JobRunnerService>(JobRunnerService);
  });

  it('sets status running then completed', async () => {
    const jobId = 'job-1';
    const urls: { url: string; urlHash: string }[] = [
      { url: 'https://example.com', urlHash: 'abc123' },
    ];

    await service.run(jobId, urls);

    expect(jobRepository.setJobStatus).toHaveBeenNthCalledWith(
      1,
      jobId,
      JobStatus.RUNNING,
    );
    expect(jobRepository.setJobStatus).toHaveBeenNthCalledWith(
      2,
      jobId,
      JobStatus.COMPLETED,
    );
  });

  it('flushes result updates and content updates', async () => {
    const jobId = 'job-1';
    const urls: { url: string; urlHash: string }[] = [
      { url: 'https://example1.com', urlHash: 'hash1' },
      { url: 'https://example2.com', urlHash: 'hash2' },
    ];

    await service.run(jobId, urls);

    expect(urlFetcherService.fetch).toHaveBeenCalledTimes(2);
    expect(jobRepository.bulkUpdateResults).toHaveBeenCalledTimes(1);
    expect(jobContentsService.upsertMany).toHaveBeenCalledTimes(1);

    expect(jobRepository.bulkUpdateResults).toHaveBeenCalledWith(
      jobId,
      expect.arrayContaining([
        expect.objectContaining({ urlHash: 'hash1' }),
        expect.objectContaining({ urlHash: 'hash2' }),
      ]),
    );
  });

  it('maps a failed fetch into an error result patch', async () => {
    const jobId = 'job-1';
    const urls: { url: string; urlHash: string }[] = [
      { url: 'https://failing.com', urlHash: 'fail-hash' },
    ];
    const errorResult: FetchResult = {
      success: false,
      redirects: [],
      truncated: false,
      error: 'Network error',
    };
    urlFetcherService.fetch.mockResolvedValueOnce(errorResult);

    await service.run(jobId, urls);

    expect(jobRepository.bulkUpdateResults).toHaveBeenCalledWith(
      jobId,
      expect.arrayContaining([
        expect.objectContaining({
          urlHash: 'fail-hash',
          patch: expect.objectContaining({
            status: UrlResultStatus.ERROR,
            error: 'Network error',
          }),
        }),
      ]),
    );
  });
});
