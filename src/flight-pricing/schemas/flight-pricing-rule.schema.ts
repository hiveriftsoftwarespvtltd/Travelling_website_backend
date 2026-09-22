import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FlightPricingRuleDocument = FlightPricingRule & Document;

export enum MarketType {
  DOMESTIC = 'DOMESTIC',
  INTERNATIONAL = 'INTERNATIONAL',
}

export enum MarkupType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum RuleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Schema({ timestamps: true })
export class FlightPricingRule {
  @Prop({
    required: true,
    enum: Object.values(MarketType),
    default: MarketType.DOMESTIC,
    index: true,
  })
  marketType: MarketType;

  @Prop({ required: true, min: 0 })
  minFare: number;

  @Prop({ required: true, min: 0 })
  maxFare: number;

  @Prop({
    required: true,
    enum: Object.values(MarkupType),
    default: MarkupType.PERCENTAGE,
  })
  markupType: MarkupType;

  @Prop({ required: true, default: 0, min: 0 })
  markupPercentage: number;

  @Prop({ required: true, default: 0, min: 0 })
  fixedMarkup: number;

  @Prop({ required: true, default: 0, min: 0 })
  minimumMarkup: number;

  @Prop({ required: true, default: 0, min: 0 })
  maximumMarkup: number;

  @Prop({
    required: true,
    enum: Object.values(RuleStatus),
    default: RuleStatus.ACTIVE,
    index: true,
  })
  status: RuleStatus;

  @Prop({ required: true, default: 1 })
  priority: number;

  @Prop({ type: Date, default: null })
  validFrom: Date | null;

  @Prop({ type: Date, default: null })
  validUntil: Date | null;

  @Prop({ default: 'System' })
  createdBy: string;

  @Prop({ default: 'System' })
  updatedBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FlightPricingRuleSchema =
  SchemaFactory.createForClass(FlightPricingRule);

FlightPricingRuleSchema.index(
  { marketType: 1, status: 1, priority: -1 },
  { background: true },
);
FlightPricingRuleSchema.index(
  { minFare: 1, maxFare: 1 },
  { background: true },
);
