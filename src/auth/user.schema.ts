import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  mobile?: string;

  @Prop()
  otp?: string;

  @Prop()
  otpExpiry?: Date;

  @Prop({ default: false })
  isVerified: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
