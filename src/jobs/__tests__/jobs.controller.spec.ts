import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import * as request from 'supertest';
import { Model } from 'mongoose';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

import { JobDocument, Job, JobStatus, UrlResultStatus } from '../job.schema';
import { JobsModule } from '../jobs.module';
import { FetchResult, UrlFetcherService } from '../url-fetcher.service';

describe('JobsController (e2e)', () => {
  jest.setTimeout(120000); // Allow time for docker image pull/start

  let app: INestApplication;
  let mongo: StartedTestContainer;
  let jobModel: Model<JobDocument>;

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
    fetch: jest.fn().mockResolvedValue(mockFetchResult),
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

  describe('POST /jobs', () => {
    it('should create a job and return jobId', async () => {
      const response = await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'] })
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
      expect(typeof response.body.jobId).toBe('string');
    });

    it('should reject invalid URLs', async () => {
      await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['not-a-valid-url'] })
        .expect(400);
    });

    it('should reject empty URLs array', async () => {
      await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: [] })
        .expect(400);
    });

    it('should reject requests with extra fields', async () => {
      await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'], extra: 'field' })
        .expect(400);
    });
  });

  describe('GET /jobs/:jobId', () => {
    it('should return job with results after completion', async () => {
      // Create job
      const createResponse = await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'] })
        .expect(201);

      const { jobId } = createResponse.body;

      // Wait for job to complete (async processing)
      await new Promise((resolve) => setTimeout(resolve, 100));

      const getResponse = await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .expect(200);

      expect(getResponse.body.jobId).toBe(jobId);
      expect(getResponse.body.status).toBe(JobStatus.COMPLETED);
      expect(getResponse.body.results).toHaveLength(1);
      expect(getResponse.body.results[0]).toMatchObject({
        url: 'https://example.com',
        status: UrlResultStatus.SUCCESS,
        httpStatus: 200,
        contentPreview: mockFetchResult.contentPreview,
      });
      // Content should NOT be present in this response
      expect(getResponse.body.results[0].content).toBeUndefined();
    });

    it('should return 404 for non-existent job', async () => {
      await request(app.getHttpServer())
        .get('/jobs/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('GET /jobs/:jobId/urls/:urlHash', () => {
    it('should return full content for a URL', async () => {
      // Create job
      const createResponse = await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'] })
        .expect(201);

      const { jobId } = createResponse.body;

      // Wait for job to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get job to find urlHash
      const jobResponse = await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .expect(200);

      const { urlHash } = jobResponse.body.results[0];

      // Get full content
      const contentResponse = await request(app.getHttpServer())
        .get(`/jobs/${jobId}/urls/${urlHash}`)
        .expect(200);

      expect(contentResponse.body.url).toBe('https://example.com');
      expect(contentResponse.body.content).toBe(mockFetchResult.content);
    });

    it('should return 404 for non-existent URL hash', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'] })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/jobs/${createResponse.body.jobId}/urls/nonexistent`)
        .expect(404);
    });
  });

  describe('Redirect handling', () => {
    it('should store redirect chain from fetcher', async () => {
      const redirectResult: FetchResult = {
        success: true,
        httpStatus: 200,
        finalUrl: 'https://example.com/final',
        redirects: ['https://example.com/redirect1'],
        contentType: 'text/html',
        byteLength: 50,
        truncated: false,
        contentPreview: 'Final content',
        content: 'Final content',
      };
      mockFetcherService.fetch.mockResolvedValueOnce(redirectResult);

      const createResponse = await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'] })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const getResponse = await request(app.getHttpServer())
        .get(`/jobs/${createResponse.body.jobId}`)
        .expect(200);

      expect(getResponse.body.results[0].finalUrl).toBe(
        'https://example.com/final',
      );
      expect(getResponse.body.results[0].redirects).toContain(
        'https://example.com/redirect1',
      );
    });
  });

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const errorResult: FetchResult = {
        success: false,
        redirects: [],
        truncated: false,
        error: 'Connection refused',
      };
      mockFetcherService.fetch.mockResolvedValueOnce(errorResult);

      const createResponse = await request(app.getHttpServer())
        .post('/jobs')
        .send({ urls: ['https://example.com'] })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const getResponse = await request(app.getHttpServer())
        .get(`/jobs/${createResponse.body.jobId}`)
        .expect(200);

      expect(getResponse.body.results[0].status).toBe(UrlResultStatus.ERROR);
      expect(getResponse.body.results[0].error).toBe('Connection refused');
    });
  });
});
