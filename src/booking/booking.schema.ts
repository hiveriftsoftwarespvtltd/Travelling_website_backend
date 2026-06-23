import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BookingDocument = Booking & Document;

@Schema({ timestamps: true })
export class Booking {
  @Prop({ required: true })
  tourName: string;

  @Prop({ required: true })
  tourId: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  mobile: string;

  @Prop({ required: false })
  city: string;

  @Prop({ required: false })
  country: string;

  @Prop({ required: true })
  travelDate: string;

  @Prop({ required: true, default: 1 })
  adults: number;

  @Prop({ required: false, default: 0 })
  children: number;

  @Prop({ required: false, default: 1 })
  rooms: number;

  @Prop({ required: false })
  specialRequirements: string;

  @Prop({ required: true, default: 'New' })
  status: string; // 'New', 'Contacted', 'Follow Up', 'Confirmed', 'Cancelled'
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
