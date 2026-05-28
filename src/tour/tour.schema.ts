import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TourDocument = Tour & Document;

@Schema({ timestamps: true })
export class Tour {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  image: string;

  @Prop({ required: true, default: 0 })
  price: number;

  @Prop({ required: true, default: '7 Days' })
  duration: string;

  @Prop({ required: true, default: 4.8 })
  rating: number;

  @Prop({ required: true, default: 4.8 })
  reviewsCount: number;
}

export const TourSchema = SchemaFactory.createForClass(Tour);
