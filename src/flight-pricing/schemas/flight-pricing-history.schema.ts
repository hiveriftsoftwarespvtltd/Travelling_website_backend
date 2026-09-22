import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type FlightPricingHistoryDocument = FlightPricingHistory & Document;

export enum HistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  ACTIVATE = 'ACTIVATE',
  DEACTIVATE = 'DEACTIVATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

@Schema({ timestamps: true })
export class FlightPricingHistory {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'FlightPricingRule', required: false, index: true })
  ruleId: Types.ObjectId;

  @Prop({ required: true })
  marketType: string;

  @Prop({ required: true })
  fareRange: string;

  @Prop()
  oldMarkup: string;

  @Prop({ required: true })
  newMarkup: string;

  @Prop({ default: 0 })
  oldMinimum: number;

  @Prop({ default: 0 })
  newMinimum: number;

  @Prop({ default: 0 })
  oldMaximum: number;

  @Prop({ default: 0 })
  newMaximum: number;

  @Prop({ required: true, enum: Object.values(HistoryAction) })
  action: HistoryAction;

  @Prop({ default: 'Admin' })
  changedBy: string;

  @Prop({ default: 'ACTIVE' })
  status: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  details: any;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FlightPricingHistorySchema =
  SchemaFactory.createForClass(FlightPricingHistory);

FlightPricingHistorySchema.index({ createdAt: -1 });
FlightPricingHistorySchema.index({ marketType: 1, createdAt: -1 });
