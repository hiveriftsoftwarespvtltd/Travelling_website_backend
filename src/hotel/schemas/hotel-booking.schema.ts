import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

export type HotelBookingDocument = HotelBooking & Document;

@Schema({ timestamps: true })
export class HotelBooking {
  @Prop({ required: true, index: true })
  bookingId: string; // TBO Booking ID or our own reference if TBO fails

  @Prop()
  confirmationNo: string;

  @Prop({ required: true, index: true })
  clientReferenceNo: string;

  @Prop()
  razorpayOrderId: string;

  @Prop()
  razorpayPaymentId: string;

  @Prop({ required: true, default: 'PENDING_PAYMENT' })
  status: string; // PENDING_PAYMENT, PAYMENT_SUCCESS, BOOKING_IN_PROGRESS, CONFIRMED, PENDING_CONFIRMATION, FAILED, REFUND_INITIATED, REFUND_COMPLETED, CANCELLED, COMPLETED

  @Prop({ type: SchemaTypes.Mixed })
  hotelDetails: any; // HotelCode, HotelName, CityId, Address, StarRating

  @Prop({ type: SchemaTypes.Mixed })
  roomDetails: any; // RoomTypeCode, RoomTypeName, etc.

  @Prop({ type: SchemaTypes.Mixed })
  guestDetails: any; // Passengers

  @Prop({ type: SchemaTypes.Mixed })
  fareDetails: any; // Amounts

  @Prop({ type: SchemaTypes.Mixed })
  voucherDetails: any; // VoucherUrl, etc.

  @Prop()
  endUserIp: string;
  
  @Prop()
  traceId: string;

  @Prop({ type: SchemaTypes.Mixed })
  apiLogs: any; // To store raw request/response for debugging
}

export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
