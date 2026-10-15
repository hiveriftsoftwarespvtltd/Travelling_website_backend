import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightPricingController } from './flight-pricing.controller';
import { FlightPricingService } from './flight-pricing.service';
import { CompetitorPricingService } from './competitor-pricing.service';
import {
  FlightPricingRule,
  FlightPricingRuleSchema,
} from './schemas/flight-pricing-rule.schema';
import {
  FlightPricingHistory,
  FlightPricingHistorySchema,
} from './schemas/flight-pricing-history.schema';
import {
  FlightPricingReview,
  FlightPricingReviewSchema,
} from './schemas/flight-pricing-review.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightPricingRule.name, schema: FlightPricingRuleSchema },
      { name: FlightPricingHistory.name, schema: FlightPricingHistorySchema },
      { name: FlightPricingReview.name, schema: FlightPricingReviewSchema },
    ]),
  ],
  controllers: [FlightPricingController],
  providers: [FlightPricingService, CompetitorPricingService],
  exports: [FlightPricingService, CompetitorPricingService],
})
export class FlightPricingModule {}

