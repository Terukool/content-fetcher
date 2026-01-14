import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Readable } from 'stream';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { createPreview } from './utils/preview.util';

export interface FetchResult {
  success: boolean;
  httpStatus?: number;
  finalUrl?: string;
  redirects: string[];
  contentType?: string;
  byteLength?: number;
  truncated: boolean;
  contentPreview?: string;
  content?: string;
  error?: string;
}

@Injectable()
export class UrlFetcherService {
  private readonly _blockedHosts: string[];
  constructor(
    private readonly httpService: HttpService,
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
  ) {
    this._blockedHosts = this.appConfig.hostsBlacklist
      .map((h) => this.normalizeHost(h))
      .filter(Boolean);
  }

  async fetch(url: string): Promise<FetchResult> {
    const state = this.createRedirectState(url);

    try {
      const firstValidation = this.validateTargetUrl(state.currentUrl);
      if (firstValidation.ok === false) {
        return this.errorResult(firstValidation.error, state.redirects);
      }

      const finalResponse = await this.followRedirects(state);
      const contentType = this.getHeader(finalResponse, 'content-type');
      const declaredLength = this.parseContentLength(finalResponse);
      const { content, byteLength, truncated } = await this.readStreamWithLimit(
        finalResponse.data,
      );

      return {
        success: true,
        httpStatus: finalResponse.status,
        finalUrl:
          state.currentUrl !== state.initialUrl ? state.currentUrl : undefined,
        redirects: state.redirects,
        contentType,
        byteLength: declaredLength ?? byteLength,
        truncated,
        contentPreview: createPreview(content, this.appConfig.previewChars),
        content: truncated ? undefined : content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.errorResult(message, state.redirects);
    }
  }

  private createRedirectState(initialUrl: string): {
    initialUrl: string;
    currentUrl: string;
    redirects: string[];
    visited: Set<string>;
  } {
    return {
      initialUrl,
      currentUrl: initialUrl,
      redirects: [],
      visited: new Set<string>([initialUrl]),
    };
  }

  private validateTargetUrl(
    rawUrl: string,
  ): { ok: true } | { ok: false; error: string } {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { ok: false, error: `Invalid URL: ${rawUrl}` };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostname = this.normalizeHost(parsed.hostname);
    if (this.isHostBlacklisted(hostname)) {
      return { ok: false, error: `Blocked host: ${hostname}` };
    }

    return { ok: true };
  }

  private normalizeHost(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, '');
  }

  private isHostBlacklisted(hostname: string): boolean {
    return this._blockedHosts.some((entry) => {
      return hostname === entry || hostname.endsWith(`.${entry}`);
    });
  }

  private async followRedirects(state: {
    currentUrl: string;
    redirects: string[];
    visited: Set<string>;
  }): Promise<AxiosResponse<Readable>> {
    let hops = 0;

    while (true) {
      const response = await this.requestOnce(state.currentUrl);

      if (!this.isRedirectStatus(response.status)) {
        return response;
      }

      if (hops >= this.appConfig.maxRedirects) {
        throw new Error(
          `Max redirects (${this.appConfig.maxRedirects}) exceeded`,
        );
      }

      const location = this.getHeader(response, 'location');
      if (!location) {
        throw new Error('Redirect without Location header');
      }

      const nextUrl = this.resolveUrl(state.currentUrl, location);
      const validation = this.validateTargetUrl(nextUrl);
      if (validation.ok === false) {
        throw new Error(validation.error);
      }

      state.redirects.push(state.currentUrl);

      if (state.visited.has(nextUrl)) {
        throw new Error('Redirect loop detected');
      }

      state.visited.add(nextUrl);
      state.currentUrl = nextUrl;
      hops += 1;
    }
  }

  private resolveUrl(base: string, location: string): string {
    try {
      return new URL(location, base).toString();
    } catch {
      return location;
    }
  }

  private async requestOnce(url: string): Promise<AxiosResponse<Readable>> {
    const requestConfig: AxiosRequestConfig = {
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: this.appConfig.timeoutMs,
      maxRedirects: 0,
      // allow us to inspect 3xx without throwing
      validateStatus: () => true,
    };

    return await firstValueFrom(
      this.httpService.request<Readable>(requestConfig),
    );
  }

  private isRedirectStatus(status: number): boolean {
    return status >= 300 && status < 400;
  }

  private getHeader(
    response: AxiosResponse<unknown>,
    headerName: string,
  ): string | undefined {
    const value = (response.headers ?? {})[headerName.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    if (typeof value === 'string') return value;
    return undefined;
  }

  private parseContentLength(
    response: AxiosResponse<unknown>,
  ): number | undefined {
    const raw = this.getHeader(response, 'content-length');
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async readStreamWithLimit(
    stream: Readable,
  ): Promise<Pick<FetchResult, 'content' | 'byteLength' | 'truncated'>> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;

    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (totalBytes + buffer.length > this.appConfig.maxBytes) {
        const remaining = this.appConfig.maxBytes - totalBytes;
        if (remaining > 0) {
          chunks.push(buffer.subarray(0, remaining));
          totalBytes += remaining;
        }
        truncated = true;
        break;
      }

      chunks.push(buffer);
      totalBytes += buffer.length;
    }

    if (truncated) {
      stream.destroy();
    }

    return {
      content: Buffer.concat(chunks).toString('utf8'),
      byteLength: totalBytes,
      truncated,
    };
  }

  private errorResult(error: string, redirects: string[]): FetchResult {
    return {
      success: false,
      redirects,
      truncated: false,
      error,
    };
  }
}
