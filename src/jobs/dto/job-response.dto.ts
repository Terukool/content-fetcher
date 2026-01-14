import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, UrlResultStatus } from '../job.schema';

export class UrlResultResponseDto {
  @ApiProperty({ description: 'Original URL' })
  url: string;

  @ApiProperty({ description: 'Stable hash identifier for the URL' })
  urlHash: string;

  @ApiProperty({
    enum: UrlResultStatus,
    description: 'Fetch status for this URL',
  })
  status: UrlResultStatus;

  @ApiPropertyOptional({ description: 'HTTP status code from the response' })
  httpStatus?: number;

  @ApiPropertyOptional({ description: 'Final URL after redirects' })
  finalUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Redirect chain' })
  redirects?: string[];

  @ApiPropertyOptional({ description: 'Content-Type header' })
  contentType?: string;

  @ApiPropertyOptional({ description: 'Response body size in bytes' })
  byteLength?: number;

  @ApiProperty({
    description: 'Whether the content was truncated due to size limits',
  })
  truncated: boolean;

  @ApiPropertyOptional({
    description: 'Preview of the content (first N characters)',
  })
  contentPreview?: string;

  @ApiPropertyOptional({ description: 'Error message if fetch failed' })
  error?: string;
}

export class JobResponseDto {
  @ApiProperty({ description: 'Job ID' })
  jobId: string;

  @ApiProperty({ enum: JobStatus, description: 'Overall job status' })
  status: JobStatus;

  @ApiProperty({ description: 'Job creation timestamp (UTC)' })
  createdAt: Date;

  @ApiProperty({ description: 'Job last update timestamp (UTC)' })
  updatedAt: Date;

  @ApiProperty({
    type: [UrlResultResponseDto],
    description: 'Results for each URL',
  })
  results: UrlResultResponseDto[];
}

export class CreateJobResponseDto {
  @ApiProperty({ description: 'Created job ID' })
  jobId: string;
}

export class FullUrlResultResponseDto extends UrlResultResponseDto {
  @ApiPropertyOptional({ description: 'Full content of the fetched URL' })
  content?: string;
}
