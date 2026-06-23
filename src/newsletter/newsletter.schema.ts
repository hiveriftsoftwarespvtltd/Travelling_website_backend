import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsletterDocument = Newsletter & Document;

@Schema({ timestamps: true })
export class Newsletter {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, default: Date.now })
  subscribeDate: Date;
}

export const NewsletterSchema = SchemaFactory.createForClass(Newsletter);
