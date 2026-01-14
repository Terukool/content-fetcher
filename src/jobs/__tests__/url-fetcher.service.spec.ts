import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { Readable } from 'stream';
import { UrlFetcherService } from '../url-fetcher.service';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

describe('UrlFetcherService', () => {
  let service: UrlFetcherService;

  const appConfig: AppConfig = {
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/test',
    maxUrlsPerJob: 10,
    concurrency: 5,
    mongoBatchTimeMs: 250,
    mongoBatchSize: 10,
    timeoutMs: 1000,
    maxRedirects: 3,
    maxBytes: 1024 * 1024,
    previewChars: 10,
    hostsBlacklist: ['localhost'],
  };

  const httpRequestMock = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlFetcherService,
        {
          provide: HttpService,
          useValue: { request: httpRequestMock },
        },
        {
          provide: APP_CONFIG,
          useValue: appConfig,
        },
      ],
    }).compile();

    service = module.get(UrlFetcherService);
    httpRequestMock.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have fetch method', () => {
    expect(typeof service.fetch).toBe('function');
  });

  it('should block blacklisted hosts', async () => {
    const result = await service.fetch('http://localhost:3000');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Blocked host');
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it('should fetch non-blacklisted hosts', async () => {
    httpRequestMock.mockReturnValue(
      of({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        data: Readable.from([Buffer.from('hello_world')]),
      }),
    );

    const result = await service.fetch('https://example.com');

    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.contentPreview).toBe('hello_worl...');
  });
});
