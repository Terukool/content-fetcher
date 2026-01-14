import { Injectable, Logger } from '@nestjs/common';
import { from, lastValueFrom, Observable, of } from 'rxjs';
import { throwError } from 'rxjs';
import {
  bufferTime,
  catchError,
  concatMap,
  filter,
  map,
  mergeMap,
  reduce,
} from 'rxjs/operators';
import { JobsRepository, JobUpdatePayload } from './jobs.repository';
import { FetchResult, UrlFetcherService } from './url-fetcher.service';
import { JobStatus, UrlResult, UrlResultStatus } from './job.schema';
import { AppConfig } from '../config/config';
import { JobContentsService } from '../job-contents/job-contents.service';

type RunnerUpdatePayload = JobUpdatePayload & { content: string | null };
type UrlWithHash = {
  url: string;
  urlHash: string;
};

@Injectable()
export class JobRunnerService {
  private readonly _logger = new Logger(JobRunnerService.name);

  private readonly _concurrency: number;
  private readonly _batchTimeMs: number;
  private readonly _batchSize: number;

  constructor(
    private readonly _jobRepository: JobsRepository,
    private readonly _urlFetcherService: UrlFetcherService,
    private readonly _jobsContentService: JobContentsService,
    appConfig: AppConfig,
  ) {
    this._concurrency = appConfig.concurrentFetchRequests;
    this._batchTimeMs = appConfig.mongoBatchTimeMs;
    this._batchSize = appConfig.mongoBatchSize;
  }

  public async run(
    jobId: string,
    urlsWithHashes: UrlWithHash[],
  ): Promise<void> {
    this._logger.log(
      `Job ${jobId} starting: urls=${urlsWithHashes.length} concurrency=${this._concurrency} batchTimeMs=${this._batchTimeMs} batchSize=${this._batchSize}`,
    );
    await this._jobRepository.setJobStatus(jobId, JobStatus.RUNNING);

    try {
      await this.processUrlsConcurrently(jobId, urlsWithHashes);
      await this._jobRepository.setJobStatus(jobId, JobStatus.COMPLETED);
      this._logger.log(`Job ${jobId} completed`);
    } catch (error) {
      this._logger.error(`Job ${jobId} failed unexpectedly:`, error);
      await this._jobRepository.setJobStatus(jobId, JobStatus.FAILED);
    }
  }

  private async processUrlsConcurrently(
    jobId: string,
    urlsWithHashes: UrlWithHash[],
  ): Promise<void> {
    const processUrls$ = from(urlsWithHashes).pipe(
      mergeMap((item) => this.fetchOne$(item), this._concurrency),
      bufferTime(this._batchTimeMs, undefined, this._batchSize),
      filter((batch) => batch.length > 0),
      concatMap((batch) => this.flushBatch$(jobId, batch)),
      reduce((count) => count + 1, 0),
    );

    await lastValueFrom(processUrls$);
  }

  private fetchOne$({
    url,
    urlHash,
  }: UrlWithHash): Observable<RunnerUpdatePayload> {
    return from(this._urlFetcherService.fetch(url)).pipe(
      map((fetchResult) => ({
        urlHash,
        patch: this.buildPatch(fetchResult),
        content: !fetchResult.content ? null : fetchResult.content,
      })),
      catchError((err) =>
        of({
          urlHash,
          patch: this.buildErrorPatch(err),
          content: null,
        }),
      ),
    );
  }

  private flushBatch$(
    jobId: string,
    batch: RunnerUpdatePayload[],
  ): Observable<void> {
    const contentUpdates = batch
      .filter((item): item is RunnerUpdatePayload & { content: string } => {
        return item.content !== null && typeof item.content === 'string';
      })
      .map(({ urlHash, content }) => ({ urlHash, content }));

    const successCount = batch.filter(
      (b) => b.patch.status === UrlResultStatus.SUCCESS,
    ).length;
    const errorCount = batch.filter(
      (b) => b.patch.status === UrlResultStatus.ERROR,
    ).length;

    this._logger.debug(
      `Job ${jobId} flushing batch: results=${batch.length} success=${successCount} error=${errorCount} contents=${contentUpdates.length}`,
    );

    return from(
      Promise.all([
        this._jobRepository.bulkUpdateResults(jobId, batch),
        this._jobsContentService.upsertMany(jobId, contentUpdates),
      ]),
    ).pipe(
      map(() => undefined),
      catchError((error) => {
        this._logger.error(
          `Job ${jobId} batch flush failed (results=${batch.length}, contents=${contentUpdates.length})`,
          error,
        );
        return throwError(() => error);
      }),
    );
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
