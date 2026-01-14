import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { Readable } from 'stream';
import { UrlFetcherService } from '../url-fetcher.service';
import { AppConfig } from '../../config/config';
import { UrlValidatorService } from '../url-validator.service';

describe('UrlFetcherService', () => {
  let service: UrlFetcherService;
  let httpRequestMock: ReturnType<typeof vi.fn>;

  const CONFIG: AppConfig = {
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/test',
    maxUrlsPerJob: 10,
    concurrentFetchRequests: 5,
    mongoBatchTimeMs: 250,
    mongoBatchSize: 10,
    timeoutMs: 1000,
    maxRedirects: 3,
    maxBytes: 1024 * 1024,
    previewChars: 10,
    hostsBlacklist: ['localhost'],
  };

  const URL_BLOCKED = 'http://localhost:3000';
  const URL_ALLOWED = 'https://example.com';

  beforeEach(async () => {
    httpRequestMock = vi.fn();

    const urlValidator = {
      validate: vi.fn((url: string) => {
        if (url.startsWith('http://localhost')) {
          return { ok: false as const, error: 'Blocked host: localhost' };
        }
        return { ok: true as const };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlFetcherService,
        {
          provide: HttpService,
          useValue: { request: httpRequestMock },
        },
        {
          provide: AppConfig,
          useValue: CONFIG,
        },
        {
          provide: UrlValidatorService,
          useValue: urlValidator,
        },
      ],
    }).compile();

    service = module.get(UrlFetcherService);
  });

  it('blocks blacklisted hosts', async () => {
    const result = await service.fetch(URL_BLOCKED);

    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Blocked host');
  });

  it('fetches a url and returns a preview', async () => {
    const body = 'hello_world';
    httpRequestMock.mockReturnValue(
      of({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        data: Readable.from([Buffer.from(body)]),
      }),
    );

    const result = await service.fetch(URL_ALLOWED);

    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.contentPreview).toBe('hello_worl...');
  });
});
