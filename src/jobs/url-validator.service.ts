import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/config';

type ValidationResult = { ok: true } | { ok: false; error: string };

@Injectable()
export class UrlValidatorService {
  private readonly _blockedHosts: string[];

  public constructor(private readonly _config: AppConfig) {
    this._blockedHosts = this._config.hostsBlacklist
      .map((h) => this.normalizeHost(h))
      .filter(Boolean);
  }

  public validate(rawUrl: string): ValidationResult {
    const parsed = this.parseUrl(rawUrl);
    if (parsed.ok === false) return parsed;

    if (!this.isAllowedProtocol(parsed.url.protocol)) {
      return {
        ok: false,
        error: `Unsupported protocol: ${parsed.url.protocol}`,
      };
    }

    const hostname = this.normalizeHost(parsed.url.hostname);
    if (this.isHostBlacklisted(hostname)) {
      return { ok: false, error: `Blocked host: ${hostname}` };
    }

    return { ok: true };
  }

  private parseUrl(
    rawUrl: string,
  ): { ok: true; url: URL } | { ok: false; error: string } {
    try {
      return { ok: true, url: new URL(rawUrl) };
    } catch {
      return { ok: false, error: `Invalid URL: ${rawUrl}` };
    }
  }

  private isAllowedProtocol(protocol: string): boolean {
    return protocol === 'http:' || protocol === 'https:';
  }

  private normalizeHost(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, '');
  }

  private isHostBlacklisted(hostname: string): boolean {
    return this._blockedHosts.some((entry) => {
      return hostname === entry || hostname.endsWith(`.${entry}`);
    });
  }
}
