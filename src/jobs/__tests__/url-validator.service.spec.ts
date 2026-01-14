import { describe, it, expect } from 'vitest';
import { UrlValidatorService } from '../url-validator.service';
import { AppConfig } from '../../config/config';

describe('UrlValidatorService', () => {
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

  const createService = () => new UrlValidatorService(CONFIG);

  it('blocks blacklisted hosts', () => {
    const service = createService();

    const result = service.validate('http://localhost:3000');

    expect(result.ok).toBe(false);
  });

  it('blocks blacklisted subdomains', () => {
    const service = createService();

    const result = service.validate('http://foo.localhost:3000');

    expect(result.ok).toBe(false);
  });

  it('rejects invalid urls', () => {
    const service = createService();

    const result = service.validate('not-a-url');

    expect(result.ok).toBe(false);
  });

  it('rejects non-http protocols', () => {
    const service = createService();

    const result = service.validate('ftp://example.com');

    expect(result.ok).toBe(false);
  });

  it('allows http/https to non-blacklisted hosts', () => {
    const service = createService();

    const result = service.validate('https://example.com');

    expect(result.ok).toBe(true);
  });
});
