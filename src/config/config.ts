import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DEFAULT_HOSTS_BLACKLIST = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

export class AppConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  public port = 3000;

  @IsString()
  @Matches(/^mongodb(\+srv)?:\/\//, {
    message: 'mongoUri must start with mongodb:// or mongodb+srv://',
  })
  public mongoUri = 'mongodb://localhost:27017/content-fetcher';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  public maxUrlsPerJob = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  public concurrentFetchRequests = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  public mongoBatchTimeMs = 250;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  public mongoBatchSize = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  public timeoutMs = 10_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  public maxRedirects = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15 * 1024 * 1024) // MongoDB document size limit is 16MB
  public maxBytes = 10 * 1024 * 1024;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  public previewChars = 500;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }) => {
    const extra = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : [];

    const merged = [...DEFAULT_HOSTS_BLACKLIST, ...extra]
      .map((v) => String(v).trim())
      .filter(Boolean);

    return Array.from(new Set(merged));
  })
  public hostsBlacklist = DEFAULT_HOSTS_BLACKLIST;
}
