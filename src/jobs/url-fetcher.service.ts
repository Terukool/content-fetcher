import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { Readable } from 'stream';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { AppConfig } from '../config/config';
import { createPreview } from './utils/preview.util';
import { UrlValidatorService } from './url-validator.service';

interface FetchState {
  initialUrl: string;
  currentUrl: string;
  redirects: string[];
  visited: Set<string>;
}

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
  private readonly _logger = new Logger(UrlFetcherService.name);

  constructor(
    private readonly _httpService: HttpService,
    private readonly _appConfig: AppConfig,
    private readonly _urlValidator: UrlValidatorService,
  ) {}

  public async fetch(url: string): Promise<FetchResult> {
    const state = this.createInitialState(url);

    try {
      this._logger.debug(`Fetch start: url=${state.currentUrl}`);
      const firstValidation = this._urlValidator.validate(state.currentUrl);
      if (firstValidation.ok === false) {
        this._logger.warn(`Fetch blocked: ${firstValidation.error}`);
        return this.errorResult(firstValidation.error, state.redirects);
      }

      const finalResponse = await this.followRedirects(state);
      const contentType = this.getHeader(finalResponse, 'content-type');
      const declaredLength = this.parseContentLength(finalResponse);
      const { content, byteLength, truncated } = await this.readStreamWithLimit(
        finalResponse.data,
      );

      this._logger.debug(
        `Fetch success: status=${finalResponse.status} bytes=${declaredLength ?? byteLength} truncated=${truncated} redirects=${state.redirects.length}`,
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
        contentPreview: createPreview(content, this._appConfig.previewChars),
        content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this._logger.warn(`Fetch failed: ${message}`);
      return this.errorResult(message, state.redirects);
    }
  }

  private createInitialState(initialUrl: string): FetchState {
    return {
      initialUrl,
      currentUrl: initialUrl,
      redirects: [],
      visited: new Set<string>([initialUrl]),
    };
  }

  private async followRedirects(
    mutableState: FetchState,
  ): Promise<AxiosResponse<Readable>> {
    let hops = 0;

    while (true) {
      const currentValidation = this._urlValidator.validate(
        mutableState.currentUrl,
      );
      if (currentValidation.ok === false) {
        throw new Error(currentValidation.error);
      }

      const response = await this.requestOnce(mutableState.currentUrl);

      if (!this.isRedirectStatus(response.status)) {
        return response;
      }

      if (hops >= this._appConfig.maxRedirects) {
        throw new Error(
          `Max redirects (${this._appConfig.maxRedirects}) exceeded`,
        );
      }

      const location = this.getHeader(response, 'location');
      if (!location) {
        throw new Error('Redirect without Location header');
      }

      const nextUrl = this.resolveUrl(mutableState.currentUrl, location);
      this._logger.debug(
        `Redirect: status=${response.status} from=${mutableState.currentUrl} to=${nextUrl}`,
      );
      const validation = this._urlValidator.validate(nextUrl);
      if (validation.ok === false) {
        throw new Error(validation.error);
      }

      mutableState.redirects.push(mutableState.currentUrl);

      if (mutableState.visited.has(nextUrl)) {
        throw new Error('Redirect loop detected');
      }

      mutableState.visited.add(nextUrl);
      mutableState.currentUrl = nextUrl;
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
      timeout: this._appConfig.timeoutMs,
      maxRedirects: 0,
      // allow us to inspect 3xx without throwing
      validateStatus: () => true,
    };

    return await firstValueFrom(
      this._httpService.request<Readable>(requestConfig),
    );
  }

  private isRedirectStatus(status: number): boolean {
    return [301, 302, 303, 307, 308].includes(status);
  }

  private parseContentLength(
    response: AxiosResponse<unknown>,
  ): number | undefined {
    const raw = this.getHeader(response, 'content-length');
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
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

  private async readStreamWithLimit(
    stream: Readable,
  ): Promise<Pick<FetchResult, 'content' | 'byteLength' | 'truncated'>> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;

    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (totalBytes + buffer.length > this._appConfig.maxBytes) {
        const remainingBytes = this._appConfig.maxBytes - totalBytes;
        if (remainingBytes > 0) {
          chunks.push(buffer.subarray(0, remainingBytes));
          totalBytes += remainingBytes;
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
