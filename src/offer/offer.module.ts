import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settings, SettingsSchema } from '../settings/settings.schema';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Settings.name, schema: SettingsSchema }]),
  ],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
