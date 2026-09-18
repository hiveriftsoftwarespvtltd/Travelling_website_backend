import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Destination, DestinationDocument } from './destination.schema';
import { DestinationDto } from './dto/destination.dto';

@Injectable()
export class DestinationService implements OnModuleInit {
  constructor(
    @InjectModel(Destination.name)
    private destinationModel: Model<DestinationDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.destinationModel.countDocuments();
    if (count === 0) {
      console.log('Seeding default destinations...');
      const defaultDestinations = [
        {
          name: 'Maldives',
          listings: 15,
          image: '/assets/img/destination/destination_1_1.jpg',
        },
        {
          name: 'Thailand',
          listings: 22,
          image: '/assets/img/destination/destination_1_2.jpg',
        },
        {
          name: 'Belgium',
          listings: 25,
          image: '/assets/img/destination/destination_1_3.jpg',
        },
        {
          name: 'Island',
          listings: 28,
          image: '/assets/img/destination/destination_1_4.jpg',
        },
        {
          name: 'Maldives',
          listings: 30,
          image: '/assets/img/destination/destination_1_5.jpg',
        },
      ];
      await this.destinationModel.create(defaultDestinations);
      console.log('Destinations seeded successfully!');
    }
  }

  async findAll(): Promise<Destination[]> {
    return this.destinationModel.find().exec();
  }

  async findOne(idOrSlug: string): Promise<Destination> {
    let destination: any = null;
    if (idOrSlug && idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      destination = await this.destinationModel.findById(idOrSlug).exec();
    }
    if (!destination && idOrSlug) {
      destination = await this.destinationModel.findOne({
        name: { $regex: new RegExp(`^${idOrSlug}$`, 'i') }
      }).exec();
    }
    if (!destination && idOrSlug) {
      destination = await this.destinationModel.findOne({
        name: { $regex: new RegExp(idOrSlug, 'i') }
      }).exec();
    }
    if (!destination) {
      const capitalized = idOrSlug ? idOrSlug.charAt(0).toUpperCase() + idOrSlug.slice(1) : 'Explore Destination';
      return {
        name: capitalized,
        title: `${capitalized} Holiday Package`,
        description: `Explore the vibrant culture, scenic landscapes, and unforgettable experiences in ${capitalized}.`,
        listings: 18,
        image: '/assets/img/destination/destination_detail.png',
      } as any;
    }
    return destination;
  }

  async create(destinationDto: DestinationDto): Promise<Destination> {
    return this.destinationModel.create(destinationDto);
  }

  async update(
    id: string,
    destinationDto: DestinationDto,
  ): Promise<Destination> {
    const updated = await this.destinationModel
      .findByIdAndUpdate(id, destinationDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Destination with ID ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<Destination> {
    const deleted = await this.destinationModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Destination with ID ${id} not found`);
    }
    return deleted;
  }
}
