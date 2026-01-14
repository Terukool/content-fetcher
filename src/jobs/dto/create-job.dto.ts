import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUrl, ArrayMinSize } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({
    description: 'Array of URLs to fetch',
    example: ['https://example.com', 'https://httpbin.org/get'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({ require_protocol: true }, { each: true })
  urls: string[];
}
