import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LeadDocument = Lead & Document;

@Schema({ timestamps: true })
export class Lead {
  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  email: string;

  @Prop({ required: false })
  mobile: string;

  @Prop({ required: true })
  source: string; // 'Tour Booking Form', 'Contact Form', 'Newsletter', 'Callback Request'

  @Prop({ required: true, default: 'New' })
  status: string; // 'New', 'Closed', 'Contacted', etc.
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
