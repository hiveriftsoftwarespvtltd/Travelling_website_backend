import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { BannerModule } from './banner/banner.module';
import { CategoryModule } from './category/category.module';
import { DestinationModule } from './destination/destination.module';
import { TourModule } from './tour/tour.module';
import { GalleryModule } from './gallery/gallery.module';
import { ReviewModule } from './review/review.module';
import { BlogModule } from './blog/blog.module';
import { MailModule } from './mail/mail.module';
import { FlightModule } from './flight/flight.module';
import { HotelModule } from './hotel/hotel.module';
import { AirportModule } from './airport/airport.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    // Configure global config module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Connect to MongoDB Atlas using mongoose
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI') || configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // Features
    AuthModule,
    UploadModule,
    BannerModule,
    CategoryModule,
    DestinationModule,
    TourModule,
    GalleryModule,
    ReviewModule,
    BlogModule,
    MailModule,
    FlightModule,
    HotelModule,
    AirportModule,
    WalletModule,
  ],
})
export class AppModule { }
