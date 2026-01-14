import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import {
  CreateJobResponseDto,
  JobResponseDto,
  FullUrlResultResponseDto,
} from './dto/job-response.dto';
import { AppConfig } from '../config/config';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly _jobsService: JobsService,
    private readonly _config: AppConfig,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new URL fetching job' })
  @ApiResponse({
    status: 201,
    description: 'Job created',
    type: CreateJobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  public async createJob(
    @Body() createJobDto: CreateJobDto,
  ): Promise<CreateJobResponseDto> {
    const uniqueUrls = [...new Set(createJobDto.urls)];

    if (uniqueUrls.length > this._config.maxUrlsPerJob) {
      throw new BadRequestException(
        `Number of URLs exceeds the maximum allowed per job: ${this._config.maxUrlsPerJob}`,
      );
    }

    const jobId = await this._jobsService.createJob(uniqueUrls);
    return { jobId };
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get job status and results' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Job details',
    type: JobResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  public async getJob(@Param('jobId') jobId: string): Promise<JobResponseDto> {
    const job = await this._jobsService.getJob(jobId);

    return {
      jobId: job._id.toString(),
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      results: job.results,
    };
  }

  @Get(':jobId/urls/:urlHash')
  @ApiOperation({ summary: 'Get full content for a specific URL in a job' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiParam({ name: 'urlHash', description: 'URL hash identifier' })
  @ApiResponse({
    status: 200,
    description: 'URL content',
    type: FullUrlResultResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Job or URL not found' })
  public async getFullUrlResult(
    @Param('jobId') jobId: string,
    @Param('urlHash') urlHash: string,
  ): Promise<FullUrlResultResponseDto> {
    return this._jobsService.getFullUrlResult(jobId, urlHash);
  }
}
