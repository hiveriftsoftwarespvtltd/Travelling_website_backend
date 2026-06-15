import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

@Schema({ timestamps: true })
export class FlightBooking extends Document {
  @Prop({ required: true, index: true })
  bookingId: string;

  @Prop({ required: true, index: true })
  pnr: string;

  @Prop()
  traceId: string;

  @Prop({ required: true, default: 'Confirmed' })
  status: string; // 'Confirmed', 'Cancelled', 'Pending'

  @Prop({ type: SchemaTypes.Mixed })
  passengers: any; // Raw passenger data with tickets

  @Prop({ type: SchemaTypes.Mixed })
  flightDetails: any; // Itinerary details

  @Prop({ type: SchemaTypes.Mixed })
  fareDetails: any; // Pricing breakdown

  @Prop({ type: SchemaTypes.Mixed })
  ssrDetails: any; // Seats, Meals, Baggage (if kept separate, or inside passengers)

  // We can add userId later if auth is integrated.
  @Prop()
  endUserIp: string;
}

export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
