import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AirportDocument = Airport & Document;

@Schema({ collection: 'airports', timestamps: true })
export class Airport {
  @Prop({ index: true })
  AIRPORTNAME: string;

  @Prop({ index: true })
  AIRPORTCODE: string;

  @Prop({ index: true })
  CITYNAME: string;

  @Prop()
  CITYCODE: string;

  @Prop()
  COUNTRYCODE: string;

  @Prop()
  COUNTRYNAME: string;
}

export const AirportSchema = SchemaFactory.createForClass(Airport);

// Text index for complex searching, though regex with specific indexed fields works well too.
AirportSchema.index({ AIRPORTNAME: 'text', CITYNAME: 'text', AIRPORTCODE: 'text' });
