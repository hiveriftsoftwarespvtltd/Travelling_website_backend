import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

@Schema({ timestamps: true })
export class Cancellation extends Document {
  @Prop({ required: true, index: true })
  changeRequestId: string;

  @Prop({ required: true, index: true })
  bookingId: string;

  @Prop()
  pnr: string;

  @Prop({ required: true, default: 'Pending' }) // 'Pending', 'Processing', 'Completed', 'Rejected'
  status: string;

  @Prop({ required: true })
  cancellationType: string; // 'FULL_CANCEL', 'PARTIAL_CANCEL'

  @Prop({ type: SchemaTypes.Mixed })
  refundDetails: any; // Breakdown of refund

  @Prop()
  refundAmount: number;

  @Prop()
  cancellationCharge: number;

  @Prop()
  endUserIp: string;
}

export const CancellationSchema = SchemaFactory.createForClass(Cancellation);
