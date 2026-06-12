import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HotelPropertyDocument = HotelProperty & Document;

@Schema({ timestamps: true })
export class HotelProperty {
  @Prop({ required: true })
  HotelCode: string;

  @Prop({ required: true, index: true })
  HotelName: string;

  @Prop({ required: true })
  CityCode: string;

  @Prop({ required: true })
  CountryCode: string;

  @Prop()
  StarRating?: number;

  @Prop()
  HotelRating?: number;

  @Prop()
  HotelPicture?: string;
  
  @Prop()
  HotelAddress?: string;
}

export const HotelPropertySchema = SchemaFactory.createForClass(HotelProperty);
HotelPropertySchema.index({ HotelName: 'text' });
