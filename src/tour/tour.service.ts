import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tour, TourDocument } from './tour.schema';
import { TourDto } from './dto/tour.dto';

@Injectable()
export class TourService implements OnModuleInit {
  constructor(
    @InjectModel(Tour.name) private tourModel: Model<TourDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.tourModel.countDocuments();
    if (count === 0) {
      console.log('Seeding default tours...');
      const defaultTours = [
        {
          title: 'Greece Tour Package',
          image: '/assets/img/tour/tour_box_1.jpg',
          price: 980,
          duration: '7 Days',
          rating: 4.8,
          reviewsCount: 4.8,
        },
        {
          title: 'Italy Tour Package',
          image: '/assets/img/tour/tour_box_2.jpg',
          price: 980,
          duration: '7 Days',
          rating: 4.8,
          reviewsCount: 4.8,
        },
        {
          title: 'Dubai Tour Package',
          image: '/assets/img/tour/tour_box_3.jpg',
          price: 980,
          duration: '7 Days',
          rating: 4.8,
          reviewsCount: 4.8,
        },
        {
          title: 'Switzerland Tour',
          image: '/assets/img/tour/tour_box_4.jpg',
          price: 980,
          duration: '7 Days',
          rating: 4.8,
          reviewsCount: 4.8,
        },
      ];
      await this.tourModel.create(defaultTours);
      console.log('Tours seeded successfully!');
    }
  }

  async findAll(): Promise<Tour[]> {
    return this.tourModel.find().exec();
  }

  async create(tourDto: TourDto): Promise<Tour> {
    return this.tourModel.create(tourDto);
  }

  async update(id: string, tourDto: TourDto): Promise<Tour> {
    const updated = await this.tourModel
      .findByIdAndUpdate(id, tourDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Tour with ID ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<Tour> {
    const deleted = await this.tourModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Tour with ID ${id} not found`);
    }
    return deleted;
  }
}
