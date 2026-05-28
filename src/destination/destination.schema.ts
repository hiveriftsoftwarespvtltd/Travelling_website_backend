import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DestinationDocument = Destination & Document;

@Schema({ timestamps: true })
export class Destination {
  @Prop({ required: true })
  name: string; // The title/location name, e.g., Dubai

  @Prop({ required: true })
  image: string; // Thumbnail for lists, e.g., tour_3_1.jpg

  @Prop({ required: false, default: 0 })
  listings: number; // Number of tours associated with it

  @Prop({ required: false })
  price: string;

  @Prop({ required: false, default: '7 Days' })
  duration: string;

  @Prop({ required: false })
  bannerImg: string;

  @Prop({ required: false })
  pageTitle: string;

  @Prop({ required: false })
  description1: string;

  @Prop({ required: false })
  description2: string;

  @Prop({ required: false })
  basicInfoText: string;

  @Prop({ required: false })
  visaRequirements: string;

  @Prop({ required: false })
  language: string;

  @Prop({ required: false })
  currency: string;

  @Prop({ required: false })
  area: string;

  @Prop({ required: false })
  tourPlaces: string;

  @Prop({ required: false })
  quoteText: string;

  @Prop({ required: false })
  quoteAuthor: string;

  @Prop({ required: false })
  description3: string;

  @Prop({ required: false })
  description4: string;

  @Prop({ required: false })
  highlightsTitle: string;

  @Prop({ required: false })
  highlightsText: string;

  @Prop({ required: false })
  innerImage: string;

  @Prop({ type: [String], default: [] })
  highlights: string[];

  @Prop({ type: [String], default: [] })
  gallery: string[];

  @Prop({ type: Boolean, default: false })
  isPopularTour: boolean;
}

export const DestinationSchema = SchemaFactory.createForClass(Destination);
