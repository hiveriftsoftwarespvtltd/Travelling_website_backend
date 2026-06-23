import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({ required: true })
  destinationId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  website: string;

  @Prop({ required: true })
  comment: string;

  @Prop({ default: 5 })
  rating: number;

  @Prop({ required: false })
  city: string;

  @Prop({ required: false })
  customerImage: string;

  @Prop({ required: false, default: 'Active' })
  status: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
