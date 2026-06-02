import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TravelTokenDocument = TravelToken & Document;

@Schema({ timestamps: true })
export class TravelToken {
  @Prop({ required: true, default: 'travel-api', unique: true })
  provider: string;

  @Prop({ required: true })
  tokenId: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const TravelTokenSchema = SchemaFactory.createForClass(TravelToken);
