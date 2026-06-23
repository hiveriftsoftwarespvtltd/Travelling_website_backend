import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking, BookingDocument } from './booking.schema';
import { LeadService } from '../lead/lead.service';
import { Destination, DestinationDocument } from '../destination/destination.schema';
import { Blog, BlogDocument } from '../blog/blog.schema';
import { Review, ReviewDocument } from '../review/review.schema';
import { Gallery, GalleryDocument } from '../gallery/gallery.schema';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Destination.name) private destinationModel: Model<DestinationDocument>,
    @InjectModel(Blog.name) private blogModel: Model<BlogDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Gallery.name) private galleryModel: Model<GalleryDocument>,
    private readonly leadService: LeadService,
  ) {}

  async create(createDto: any): Promise<Booking> {
    const newBooking = new this.bookingModel(createDto);
    const saved = await newBooking.save();

    // Auto-generate consolidated entry in Leads collection
    await this.leadService.create({
      name: `${saved.firstName} ${saved.lastName}`,
      email: saved.email,
      mobile: saved.mobile,
      source: 'Tour Booking Form',
      status: 'New',
    });

    return saved;
  }

  async findAll(status?: string): Promise<Booking[]> {
    const filter = status ? { status } : {};
    return this.bookingModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingModel.findById(id).exec();
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return booking;
  }

  async updateStatus(id: string, status: string): Promise<Booking> {
    const updated = await this.bookingModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<any> {
    const result = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return result;
  }

  async getDashboardMetrics(): Promise<any> {
    const totalBookings = await this.bookingModel.countDocuments();
    const newEnquiries = await this.bookingModel.countDocuments({ status: 'New' });
    const contacted = await this.bookingModel.countDocuments({ status: 'Contacted' });
    const followUp = await this.bookingModel.countDocuments({ status: 'Follow Up' });
    const confirmed = await this.bookingModel.countDocuments({ status: 'Confirmed' });
    const cancelled = await this.bookingModel.countDocuments({ status: 'Cancelled' });
    const totalDestinations = await this.destinationModel.countDocuments();
    const totalBlogs = await this.blogModel.countDocuments();
    const totalReviews = await this.reviewModel.countDocuments();
    const totalGallery = await this.galleryModel.countDocuments();

    const recentBookings = await this.bookingModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    return {
      totalBookings,
      newEnquiries,
      contacted,
      followUp,
      confirmed,
      cancelled,
      totalDestinations,
      totalBlogs,
      totalReviews,
      totalGallery,
      recentBookings,
    };
  }
}
