import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GalleryDocument = Gallery & Document;

@Schema({ timestamps: true })
export class Gallery {
  @Prop({ required: true })
  imageUrl: string;

  @Prop({ default: 'gallery' })
  title: string;

  @Prop({ required: false })
  caption: string;

  @Prop({ required: false })
  destination: string;

  @Prop({ required: false, default: 'Active' })
  status: string;
}

export const GallerySchema = SchemaFactory.createForClass(Gallery);
