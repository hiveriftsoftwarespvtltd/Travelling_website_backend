import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerDocument = Banner & Document;

@Schema({ timestamps: true })
export class Banner {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  subTitle: string;

  @Prop({ required: true })
  bgImage: string;

  @Prop({ required: false, default: 'Book Now' })
  buttonText: string;

  @Prop({ required: false, default: '/tour' })
  buttonLink: string;

  @Prop({ required: false, default: 'Active' })
  status: string;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);
