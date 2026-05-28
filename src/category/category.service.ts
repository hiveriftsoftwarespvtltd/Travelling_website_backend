import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './category.schema';
import { CategoryDto } from './dto/category.dto';

@Injectable()
export class CategoryService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.categoryModel.countDocuments();
    if (count === 0) {
      console.log('Seeding default categories...');
      const defaultCategories = [
        { title: 'Cruises', imgSrc: '/assets/img/category/category_1_1.jpg' },
        { title: 'Hiking', imgSrc: '/assets/img/category/category_1_2.jpg' },
        { title: 'Airbirds', imgSrc: '/assets/img/category/category_1_3.jpg' },
        { title: 'Wildlife', imgSrc: '/assets/img/category/category_1_4.jpg' },
        { title: 'Walking', imgSrc: '/assets/img/category/category_1_5.jpg' },
      ];
      await this.categoryModel.create(defaultCategories);
      console.log('Categories seeded successfully!');
    }
  }

  async findAll(): Promise<Category[]> {
    return this.categoryModel.find().exec();
  }

  async create(categoryDto: CategoryDto): Promise<Category> {
    return this.categoryModel.create(categoryDto);
  }

  async update(id: string, categoryDto: CategoryDto): Promise<Category> {
    const updated = await this.categoryModel
      .findByIdAndUpdate(id, categoryDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<Category> {
    const deleted = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return deleted;
  }
}
