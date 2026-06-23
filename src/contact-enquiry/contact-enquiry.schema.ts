import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactEnquiryDocument = ContactEnquiry & Document;

@Schema({ timestamps: true })
export class ContactEnquiry {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  mobile: string;

  @Prop({ required: false })
  subject: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true, default: 'New' })
  status: string; // 'New', 'Contacted', 'Closed'
}

export const ContactEnquirySchema = SchemaFactory.createForClass(ContactEnquiry);
