import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

  let appConfig: AppConfig;

  const BASE_CONFIG: AppConfig = {
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
    appConfig = { ...BASE_CONFIG };

    const urlValidator = {
      validate: vi.fn((url: string) => {
        if (url.startsWith('http://localhost')) {
          return { ok: false as const, error: 'Blocked host: localhost' };
        }
        return { ok: true as const };
      }),
    };

    afterEach(async () => {
      vi.clearAllMocks();
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlFetcherService,
        {
          provide: HttpService,
          useValue: { request: httpRequestMock },
        },
        {
          provide: AppConfig,
          useValue: appConfig,
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

  it('truncates response when exceeding maxBytes', async () => {
    appConfig.maxBytes = 5;
    appConfig.previewChars = 10;

    httpRequestMock.mockReturnValue(
      of({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        data: Readable.from([Buffer.from('hello_world')]),
      }),
    );

    const result = await service.fetch(URL_ALLOWED);

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.byteLength).toBe(5);
    expect(result.content).toBe('hello');
    expect(result.contentPreview).toBe('hello');
  });

  it('truncates contentPreview when previewChars is smaller than the fetched content', async () => {
    appConfig.maxBytes = 8;
    appConfig.previewChars = 5;

    httpRequestMock.mockReturnValue(
      of({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        data: Readable.from([Buffer.from('hello_world')]),
      }),
    );

    const result = await service.fetch(URL_ALLOWED);

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.byteLength).toBe(8);
    expect(result.content).toBe('hello_wo');
    expect(result.contentPreview).toBe('hello...');
  });

  it('fails when exceeding max redirects', async () => {
    appConfig.maxRedirects = 1;

    httpRequestMock
      .mockReturnValueOnce(
        of({
          status: 302,
          headers: { location: '/next' },
          data: Readable.from([]),
        }),
      )
      .mockReturnValueOnce(
        of({
          status: 302,
          headers: { location: '/final' },
          data: Readable.from([]),
        }),
      );

    const result = await service.fetch('https://example.com/start');

    expect(httpRequestMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Max redirects');
  });

  it('fails on redirect without Location header', async () => {
    httpRequestMock.mockReturnValue(
      of({
        status: 302,
        headers: {},
        data: Readable.from([]),
      }),
    );

    const result = await service.fetch('https://example.com/start');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Redirect without Location header');
    expect(result.redirects).toEqual([]);
  });

  it('fails on redirect loop (A → B → A)', async () => {
    httpRequestMock
      .mockReturnValueOnce(
        of({
          status: 302,
          headers: { location: '/b' },
          data: Readable.from([]),
        }),
      )
      .mockReturnValueOnce(
        of({
          status: 302,
          headers: { location: '/a' },
          data: Readable.from([]),
        }),
      );

    const result = await service.fetch('https://example.com/a');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Redirect loop detected');
    expect(result.redirects).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('falls back to streamed byte count when content-length is invalid', async () => {
    httpRequestMock.mockReturnValue(
      of({
        status: 200,
        headers: { 'content-length': 'nope', 'content-type': 'text/plain' },
        data: Readable.from([Buffer.from('hello_world')]),
      }),
    );

    const result = await service.fetch(URL_ALLOWED);

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.byteLength).toBe(11);
  });
});
