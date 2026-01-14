import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobContentDocument = JobContent & Document;

@Schema({ timestamps: true, collection: 'job_contents' })
export class JobContent {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  jobId: Types.ObjectId;

  @Prop({ required: true, index: true })
  urlHash: string;

  @Prop({ required: true })
  content: string;
}

export const JobContentSchema = SchemaFactory.createForClass(JobContent);

JobContentSchema.index({ jobId: 1, urlHash: 1 }, { unique: true });
