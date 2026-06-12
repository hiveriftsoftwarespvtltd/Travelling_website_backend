import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HotelCityDocument = HotelCity & Document;

@Schema({ timestamps: true })
export class HotelCity {
  @Prop({ required: true })
  CityCode: string;

  @Prop({ required: true, index: true })
  CityName: string;

  @Prop({ required: true })
  CountryCode: string;

  // We can add CountryName if we want, but CityName often contains it (e.g. "Mumbai, Maharashtra")
}

export const HotelCitySchema = SchemaFactory.createForClass(HotelCity);
HotelCitySchema.index({ CityName: 'text' });
