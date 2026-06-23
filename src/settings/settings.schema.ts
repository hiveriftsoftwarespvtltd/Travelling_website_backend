import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingsDocument = Settings & Document;

@Schema({ timestamps: true })
export class Settings {
  @Prop({ required: true, default: 'Jiyo Life Travel' })
  companyName: string;

  @Prop({ required: false, default: '' })
  phone: string;

  @Prop({ required: false, default: '' })
  email: string;

  @Prop({ required: false, default: '' })
  address: string;

  @Prop({ required: false, default: '' })
  whatsappNumber: string;

  @Prop({ required: false, default: '' })
  facebookUrl: string;

  @Prop({ required: false, default: '' })
  instagramUrl: string;

  @Prop({ required: false, default: '' })
  youtubeUrl: string;

  @Prop({ required: false, default: '' })
  linkedinUrl: string;

  @Prop({ required: false, default: '' })
  metaTitle: string;

  @Prop({ required: false, default: '' })
  metaDescription: string;

  @Prop({ required: false, default: '' })
  googleAnalyticsCode: string;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
