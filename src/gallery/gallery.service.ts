import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gallery, GalleryDocument } from './gallery.schema';
import { GalleryDto } from './dto/gallery.dto';

@Injectable()
export class GalleryService implements OnModuleInit {
  constructor(
    @InjectModel(Gallery.name) private galleryModel: Model<GalleryDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.galleryModel.countDocuments();
    if (count === 0) {
      console.log('Seeding default gallery...');
      const defaultGallery = [
        { imageUrl: '/assets/img/gallery/gallery_1_1.jpg', title: 'gallery' },
        { imageUrl: '/assets/img/gallery/gallery_1_2.jpg', title: 'gallery' },
        { imageUrl: '/assets/img/gallery/gallery_1_3.jpg', title: 'gallery' },
        { imageUrl: '/assets/img/gallery/gallery_1_4.jpg', title: 'gallery' },
        { imageUrl: '/assets/img/gallery/gallery_1_5.jpg', title: 'gallery' },
        { imageUrl: '/assets/img/gallery/gallery_1_6.jpg', title: 'gallery' },
        { imageUrl: '/assets/img/gallery/gallery_1_7.jpg', title: 'gallery' },
      ];
      await this.galleryModel.create(defaultGallery);
      console.log('Gallery seeded successfully!');
    }
  }

  async findAll(): Promise<Gallery[]> {
    return this.galleryModel.find().exec();
  }

  async create(galleryDto: GalleryDto): Promise<Gallery> {
    return this.galleryModel.create(galleryDto);
  }

  async remove(id: string): Promise<Gallery> {
    const deleted = await this.galleryModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Gallery item with ID ${id} not found`);
    }
    return deleted;
  }
}
