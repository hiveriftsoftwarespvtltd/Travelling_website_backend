import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';
import { HotelCity, HotelCitySchema } from './schemas/hotel-city.schema';
import { HotelProperty, HotelPropertySchema } from './schemas/hotel-property.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HotelCity.name, schema: HotelCitySchema },
      { name: HotelProperty.name, schema: HotelPropertySchema },
    ]),
  ],
  controllers: [HotelController],
  providers: [HotelService],
})
export class HotelModule {}
