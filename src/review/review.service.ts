import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Review, ReviewDocument } from './review.schema';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

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
}
