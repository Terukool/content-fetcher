import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Model } from 'mongoose';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

import { JobDocument, Job, JobStatus, UrlResultStatus } from '../job.schema';
import { JobsModule } from '../jobs.module';
import { FetchResult, UrlFetcherService } from '../url-fetcher.service';

describe('JobsController (e2e)', () => {
  let app: INestApplication;
  let mongo: StartedTestContainer;
  let jobModel: Model<JobDocument>;

  const WAIT_MS = 25;
  const MAX_WAIT_ATTEMPTS = 40;

  const waitForCompletedJob = async (jobId: string) => {
    for (let i = 0; i < MAX_WAIT_ATTEMPTS; i += 1) {
      const response = await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .expect(200);
      if (response.body.status === JobStatus.COMPLETED) return response.body;
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
    throw new Error(`Job ${jobId} did not complete in time`);
  };

  const mockFetchResult: FetchResult = {
    success: true,
    httpStatus: 200,
    finalUrl: undefined,
    redirects: [],
    contentType: 'text/html',
    byteLength: 100,
    truncated: false,
    contentPreview: '<html>Test content...</html>',
    content: '<html>Test content for full retrieval</html>',
  };

  const mockFetcherService = {
    fetch: vi.fn().mockResolvedValue(mockFetchResult),
  };

  beforeAll(async () => {
    mongo = await new GenericContainer('mongo:7')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
      .start();
    const uri = `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/test`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), JobsModule],
    })
      .overrideProvider(UrlFetcherService)
      .useValue(mockFetcherService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    jobModel = moduleFixture.get<Model<JobDocument>>(getModelToken(Job.name));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await jobModel.deleteMany({});
    mockFetcherService.fetch.mockClear();
  });

  it('creates a job and returns results', async () => {
    const url = 'https://example.com';

    const createResponse = await request(app.getHttpServer())
      .post('/jobs')
      .send({ urls: [url] })
      .expect(201);

    const { jobId } = createResponse.body;

    const job = await waitForCompletedJob(jobId);

    expect(job.jobId).toBe(jobId);
    expect(job.status).toBe(JobStatus.COMPLETED);
    expect(job.results).toHaveLength(1);
    expect(job.results[0]).toMatchObject({
      url,
      status: UrlResultStatus.SUCCESS,
      httpStatus: 200,
      contentPreview: mockFetchResult.contentPreview,
    });
    expect(job.results[0].content).toBeUndefined();
  });

  it('returns full content for a job url', async () => {
    const url = 'https://example.com';

    const createResponse = await request(app.getHttpServer())
      .post('/jobs')
      .send({ urls: [url] })
      .expect(201);

    const { jobId } = createResponse.body;

    const job = await waitForCompletedJob(jobId);
    const { urlHash } = job.results[0];

    const contentResponse = await request(app.getHttpServer())
      .get(`/jobs/${jobId}/urls/${urlHash}`)
      .expect(200);

    expect(contentResponse.body.url).toBe(url);
    expect(contentResponse.body.content).toBe(mockFetchResult.content);
  });

  it('rejects invalid urls', async () => {
    await request(app.getHttpServer())
      .post('/jobs')
      .send({ urls: ['not-a-valid-url'] })
      .expect(400);
  });
});
