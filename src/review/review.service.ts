import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Review, ReviewDocument } from './review.schema';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewService implements OnModuleInit {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.reviewModel.countDocuments();
    if (count === 0) {
      console.log('Seeding default reviews...');
      const defaultReviews = [
        {
          destinationId: 'global',
          name: 'Poonam Khera',
          email: 'poonamkhera@example.com',
          comment: 'Reena, you are absolutely amazing! Every single detail of our vacation was perfectly organized and executed. We are so incredibly thankful to you for arranging what truly felt like a dream-come-true trip for us.',
          rating: 5,
          city: 'Delhi',
          status: 'Active',
        },
        {
          destinationId: 'global',
          name: 'Anita Gakhar',
          email: 'anitagakhar@example.com',
          comment: 'Thanks a lot, dear Reena! Because of your dedication, our recent family trip was absolutely wonderful. Every single facility we availed was top-notch, and we all had a genuinely excellent time together.',
          rating: 5,
          city: 'Mumbai',
          status: 'Active',
        },
        {
          destinationId: 'global',
          name: 'Andy Doyle',
          email: 'andydoyle@example.com',
          comment: 'Reena was highly responsive, professional, and clear with all information before and during the tour. She went out of her way to arrange great food and packed each day with unforgettable experiences.',
          rating: 5,
          city: 'London',
          status: 'Active',
        },
        {
          destinationId: 'global',
          name: 'R. Chhabra',
          email: 'rchhabra@example.com',
          comment: 'Dear Reena ji, Namaskar. Thank you so much for putting together a customized holiday itinerary for us. The entire experience turned out to be thoroughly enjoyable, smooth, and entirely seamless throughout.',
          rating: 5,
          city: 'Delhi',
          status: 'Active',
        },
        {
          destinationId: 'global',
          name: 'Diane Isaac',
          email: 'dianeisaac@example.com',
          comment: 'We had a wonderful time visiting the Taj Mahal! Everything was perfectly organized from start to finish. Both our tour guide and driver were fantastic - highly knowledgeable, professional, and very friendly.',
          rating: 5,
          city: 'New York',
          status: 'Active',
        },
        {
          destinationId: 'global',
          name: 'Kirsten Whitley',
          email: 'kirstenwhitley@example.com',
          comment: 'Jiyo Life provides excellent travel services and very comfortable hospitality accommodations for guests. Their field guides are incredibly knowledgeable, patient, and kind throughout the daily excursions.',
          rating: 5,
          city: 'Sydney',
          status: 'Active',
        },
      ];
      await this.reviewModel.create(defaultReviews);
      console.log('Default reviews seeded successfully!');
    }
  }

  async create(createReviewDto: CreateReviewDto): Promise<Review> {
    return this.reviewModel.create(createReviewDto);
  }

  async findAllByDestination(destinationId: string): Promise<Review[]> {
    return this.reviewModel.find({ destinationId }).exec();
  }

  async findAll(): Promise<Review[]> {
    return this.reviewModel.find().exec();
  }

  async remove(id: string): Promise<Review> {
    const deleted = await this.reviewModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    return deleted;
  }

  async update(id: string, updateDto: any): Promise<Review> {
    const updated = await this.reviewModel.findByIdAndUpdate(id, updateDto, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    return updated;
  }
}
