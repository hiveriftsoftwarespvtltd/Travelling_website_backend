import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Banner, BannerDocument } from './banner.schema';
import { BannerSlideDto } from './dto/banner.dto';

@Injectable()
export class BannerService implements OnModuleInit {
  constructor(
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.bannerModel.countDocuments();
    if (count === 0) {
      console.log('Seeding default hero banners...');
      const defaultSlides = [
        {
          title: 'Natural Wonder of the world',
          subTitle: 'Get unforgetable pleasure with us',
          bgImage: '/assets/img/hero/hero_bg_1_1.jpg',
        },
        {
          title: 'Let’s make your best trip with us',
          subTitle: 'Get unforgetable pleasure with us',
          bgImage: '/assets/img/hero/hero_bg_1_2.jpg',
        },
        {
          title: 'Explore beauty of the whole world',
          subTitle: 'Get unforgetable pleasure with us',
          bgImage: '/assets/img/hero/hero_bg_1_3.jpg',
        },
      ];
      await this.bannerModel.create(defaultSlides);
      console.log('Hero banners seeded successfully!');
    }
  }

  async findAll(): Promise<Banner[]> {
    return this.bannerModel.find().exec();
  }

  async updateAll(slides: BannerSlideDto[]): Promise<Banner[]> {
    // Clear all existing banners and insert the new ones
    await this.bannerModel.deleteMany({});
    return this.bannerModel.create(slides);
  }
}
