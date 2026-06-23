import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from './booking.schema';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { LeadModule } from '../lead/lead.module';
import { Destination, DestinationSchema } from '../destination/destination.schema';
import { Blog, BlogSchema } from '../blog/blog.schema';
import { Review, ReviewSchema } from '../review/review.schema';
import { Gallery, GallerySchema } from '../gallery/gallery.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Destination.name, schema: DestinationSchema },
      { name: Blog.name, schema: BlogSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Gallery.name, schema: GallerySchema },
    ]),
    LeadModule,
  ],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
