import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightPricingController } from './flight-pricing.controller';
import { FlightPricingService } from './flight-pricing.service';
import {
  FlightPricingRule,
  FlightPricingRuleSchema,
} from './schemas/flight-pricing-rule.schema';
import {
  FlightPricingHistory,
  FlightPricingHistorySchema,
} from './schemas/flight-pricing-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightPricingRule.name, schema: FlightPricingRuleSchema },
      { name: FlightPricingHistory.name, schema: FlightPricingHistorySchema },
    ]),
  ],
  controllers: [FlightPricingController],
  providers: [FlightPricingService],
  exports: [FlightPricingService],
})
export class FlightPricingModule {}
