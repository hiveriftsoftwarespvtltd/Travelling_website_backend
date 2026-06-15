import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightController } from './flight.controller';
import { FlightService } from './flight.service';
import { FlightBooking, FlightBookingSchema } from './schemas/flight-booking.schema';
import { Cancellation, CancellationSchema } from './schemas/cancellation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: Cancellation.name, schema: CancellationSchema },
    ]),
  ],
  controllers: [FlightController],
  providers: [FlightService],
})
export class FlightModule {}
