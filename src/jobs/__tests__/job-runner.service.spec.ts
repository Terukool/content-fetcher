import { Test, TestingModule } from '@nestjs/testing';
import { JobRunnerService } from '../job-runner.service';
import { JobsRepository } from '../jobs.repository';
import { UrlFetcherService, FetchResult } from '../url-fetcher.service';
import { JobStatus, UrlResultStatus } from '../job.schema';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

describe('JobRunnerService', () => {
  let service: JobRunnerService;

  const appConfig: AppConfig = {
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/test',
    maxUrlsPerJob: 10,
    concurrency: 5,
    mongoBatchTimeMs: 10,
    mongoBatchSize: 10,
    timeoutMs: 1000,
    maxRedirects: 3,
    maxBytes: 1024 * 1024,
    previewChars: 10,
    hostsBlacklist: ['localhost'],
  };

  const mockJobsRepository = {
    setJobStatus: jest.fn().mockResolvedValue(undefined),
    bulkUpdateResults: jest.fn().mockResolvedValue(undefined),
  };

  const mockFetchResult: FetchResult = {
    success: true,
    httpStatus: 200,
    redirects: [],
    contentType: 'text/html',
    byteLength: 100,
    truncated: false,
    contentPreview: 'test',
    content: 'test content',
  };

  const mockUrlFetcherService = {
    fetch: jest.fn().mockResolvedValue(mockFetchResult),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobRunnerService,
        { provide: JobsRepository, useValue: mockJobsRepository },
        { provide: UrlFetcherService, useValue: mockUrlFetcherService },
        { provide: APP_CONFIG, useValue: appConfig },
      ],
    }).compile();

    service = module.get<JobRunnerService>(JobRunnerService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set job status to running then completed', async () => {
    const jobId = 'test-job-id';
    const urlsWithHashes = [{ url: 'https://example.com', urlHash: 'abc123' }];

    await service.run(jobId, urlsWithHashes);

    expect(mockJobsRepository.setJobStatus).toHaveBeenNthCalledWith(
      1,
      jobId,
      JobStatus.RUNNING,
    );
    expect(mockJobsRepository.setJobStatus).toHaveBeenNthCalledWith(
      2,
      jobId,
      JobStatus.COMPLETED,
    );
  });

  it('should fetch each URL and update results', async () => {
    const jobId = 'test-job-id';
    const urlsWithHashes = [
      { url: 'https://example1.com', urlHash: 'hash1' },
      { url: 'https://example2.com', urlHash: 'hash2' },
    ];

    await service.run(jobId, urlsWithHashes);

    expect(mockUrlFetcherService.fetch).toHaveBeenCalledTimes(2);
    expect(mockUrlFetcherService.fetch).toHaveBeenCalledWith(
      'https://example1.com',
    );
    expect(mockUrlFetcherService.fetch).toHaveBeenCalledWith(
      'https://example2.com',
    );

    expect(mockJobsRepository.bulkUpdateResults).toHaveBeenCalledTimes(1);
    expect(mockJobsRepository.bulkUpdateResults).toHaveBeenCalledWith(
      jobId,
      expect.arrayContaining([
        expect.objectContaining({ urlHash: 'hash1' }),
        expect.objectContaining({ urlHash: 'hash2' }),
      ]),
    );
  });

  it('should handle fetch errors gracefully', async () => {
    const errorResult: FetchResult = {
      success: false,
      redirects: [],
      truncated: false,
      error: 'Network error',
    };
    mockUrlFetcherService.fetch.mockResolvedValueOnce(errorResult);

    const jobId = 'test-job-id';
    const urlsWithHashes = [
      { url: 'https://failing.com', urlHash: 'fail-hash' },
    ];

    await service.run(jobId, urlsWithHashes);

    expect(mockJobsRepository.bulkUpdateResults).toHaveBeenCalledWith(
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
    expect(mockJobsRepository.setJobStatus).toHaveBeenLastCalledWith(
      jobId,
      JobStatus.COMPLETED,
    );
  });
});
