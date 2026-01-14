import { Inject, Injectable, Logger } from '@nestjs/common';
import { from, lastValueFrom, of } from 'rxjs';
import {
  bufferTime,
  catchError,
  concatMap,
  filter,
  map,
  mergeMap,
  reduce,
} from 'rxjs/operators';
import { JobsRepository } from './jobs.repository';
import { FetchResult, UrlFetcherService } from './url-fetcher.service';
import { JobStatus, UrlResult, UrlResultStatus } from './job.schema';
import { UrlWithHash } from './models/url.model';
import { APP_CONFIG, AppConfig } from '../config/app-config';

@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger(JobRunnerService.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly urlFetcherService: UrlFetcherService,
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
  ) {}

  public async run(
    jobId: string,
    urlsWithHashes: UrlWithHash[],
  ): Promise<void> {
    await this.jobsRepository.setJobStatus(jobId, JobStatus.RUNNING);

    try {
      await this.processUrlsConcurrently(jobId, urlsWithHashes);
      await this.jobsRepository.setJobStatus(jobId, JobStatus.COMPLETED);
    } catch (error) {
      this.logger.error(`Job ${jobId} failed unexpectedly:`, error);
      await this.jobsRepository.setJobStatus(jobId, JobStatus.FAILED);
    }
  }

  private async processUrlsConcurrently(
    jobId: string,
    urlsWithHashes: UrlWithHash[],
  ): Promise<void> {
    const concurrency = this.appConfig.concurrency;
    const batchTimeMs = this.appConfig.mongoBatchTimeMs;
    const batchSize = this.appConfig.mongoBatchSize;

    const updates$ = from(urlsWithHashes).pipe(
      mergeMap(
        ({ url, urlHash }) =>
          from(this.urlFetcherService.fetch(url)).pipe(
            map((fetchResult) => ({
              urlHash,
              patch: this.buildPatch(fetchResult),
            })),
            catchError((err) =>
              of({
                urlHash,
                patch: this.buildErrorPatch(err),
              }),
            ),
          ),
        concurrency,
      ),
      bufferTime(batchTimeMs, undefined, batchSize),
      filter((batch) => batch.length > 0),
      concatMap((batch) =>
        from(this.jobsRepository.bulkUpdateResults(jobId, batch)),
      ),
      reduce((count) => count + 1, 0),
    );

    await lastValueFrom(updates$);
  }

  private buildPatch(fetchResult: Partial<FetchResult>): Partial<UrlResult> {
    return {
      status: fetchResult.success
        ? UrlResultStatus.SUCCESS
        : UrlResultStatus.ERROR,
      httpStatus: fetchResult.httpStatus,
      finalUrl: fetchResult.finalUrl,
      redirects: fetchResult.redirects,
      contentType: fetchResult.contentType,
      byteLength: fetchResult.byteLength,
      truncated: fetchResult.truncated,
      contentPreview: fetchResult.contentPreview,
      content: fetchResult.content,
      error: fetchResult.error,
    };
  }

  private buildErrorPatch(error: unknown): Partial<UrlResult> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: UrlResultStatus.ERROR,
      truncated: false,
      error: message,
    };
  }
}
