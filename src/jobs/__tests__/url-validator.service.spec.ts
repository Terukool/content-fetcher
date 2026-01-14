import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UrlValidatorService } from '../url-validator.service';
import { AppConfig } from '../../config/config';

describe('UrlValidatorService', () => {
  let module: TestingModule;
  let service: UrlValidatorService;

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

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        UrlValidatorService,
        {
          provide: AppConfig,
          useValue: CONFIG,
        },
      ],
    }).compile();

    service = module.get(UrlValidatorService);
  });

  it('blocks blacklisted hosts', () => {
    const result = service.validate('http://localhost:3000');

    expect(result.ok).toBe(false);
  });

  it('blocks blacklisted subdomains', () => {
    const result = service.validate('http://foo.localhost:3000');

    expect(result.ok).toBe(false);
  });

  it('rejects invalid urls', () => {
    const result = service.validate('not-a-url');

    expect(result.ok).toBe(false);
  });

  it('rejects non-http protocols', () => {
    const result = service.validate('ftp://example.com');

    expect(result.ok).toBe(false);
  });

  it('allows http/https to non-blacklisted hosts', () => {
    const result = service.validate('https://example.com');

    expect(result.ok).toBe(true);
  });
});
