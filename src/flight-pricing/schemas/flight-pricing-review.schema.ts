import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FlightPricingReviewDocument = FlightPricingReview & Document;

export enum ReviewStatus {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
  DISMISSED = 'DISMISSED',
  PRICE_ADJUSTED = 'PRICE_ADJUSTED',
}

@Schema({ timestamps: true })
export class FlightPricingReview {
  @Prop({ required: true, index: true })
  flightNumber: string;

  @Prop({ required: true })
  airline: string;

  @Prop({ required: true, index: true })
  route: string;

  @Prop({ required: true })
  departureTime: string;

  @Prop({ required: true })
  travelDate: string;

  @Prop({ required: true })
  cabinClass: string;

  @Prop({ required: true })
  supplierCost: number;

  @Prop({ required: true })
  ourPrice: number;

  @Prop({ required: true })
  competitorPrice: number;

  @Prop({ required: true, default: 'MakeMyTrip' })
  competitor: string;

  @Prop({ required: true })
  priceDifference: number;

  @Prop({ required: true })
  minimumSafePrice: number;

  @Prop({ required: true })
  reviewReason: string;

  @Prop({
    required: true,
    enum: Object.values(ReviewStatus),
    default: ReviewStatus.PENDING,
    index: true,
  })
  status: ReviewStatus;

  @Prop({ type: String, default: null })
  resolutionNotes: string | null;

  @Prop({ type: String, default: null })
  resolvedBy: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FlightPricingReviewSchema =
  SchemaFactory.createForClass(FlightPricingReview);

FlightPricingReviewSchema.index({ route: 1, travelDate: 1 });
FlightPricingReviewSchema.index({ status: 1, createdAt: -1 });
