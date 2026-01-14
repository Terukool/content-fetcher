import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JobDocument = Job & Document & { createdAt: Date; updatedAt: Date };

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum UrlResultStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
}

@Schema({ _id: false })
export class UrlResult {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  urlHash: string;

  @Prop({
    required: true,
    enum: UrlResultStatus,
    default: UrlResultStatus.PENDING,
  })
  status: UrlResultStatus;

  @Prop()
  httpStatus?: number;

  @Prop()
  finalUrl?: string;

  @Prop({ type: [String], default: [] })
  redirects: string[];

  @Prop()
  contentType?: string;

  @Prop()
  byteLength?: number;

  @Prop({ default: false })
  truncated: boolean;

  @Prop()
  contentPreview?: string;

  @Prop()
  error?: string;
}

export const UrlResultSchema = SchemaFactory.createForClass(UrlResult);

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @Prop({ type: [UrlResultSchema], default: [] })
  results: UrlResult[];
}

export const JobSchema = SchemaFactory.createForClass(Job);
