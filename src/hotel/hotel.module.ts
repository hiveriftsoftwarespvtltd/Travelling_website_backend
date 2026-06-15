import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';
import { HotelCity, HotelCitySchema } from './schemas/hotel-city.schema';
import { HotelProperty, HotelPropertySchema } from './schemas/hotel-property.schema';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    PaymentModule,
    MongooseModule.forFeature([
      { name: HotelCity.name, schema: HotelCitySchema },
      { name: HotelProperty.name, schema: HotelPropertySchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
  ],
  controllers: [HotelController],
  providers: [HotelService],
})
export class HotelModule {}
