import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BlogDocument = Blog & Document;

@Schema({ timestamps: true })
export class Blog {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  category: string;

  @Prop({ default: 'Admin' })
  author: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  image: string;

  @Prop()
  bannerImg: string;

  @Prop({ required: true })
  shortDescription: string;

  @Prop({ required: true })
  content1: string;

  @Prop()
  quoteText: string;

  @Prop()
  quoteAuthor: string;

  @Prop()
  content2: string;

  @Prop()
  innerImage: string;

  @Prop([String])
  tags: string[];
}

export const BlogSchema = SchemaFactory.createForClass(Blog);
