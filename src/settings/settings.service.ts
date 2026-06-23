import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async onModuleInit() {
    const existing = await this.settingsModel.findOne().exec();
    if (!existing) {
      console.log('Seeding default website settings...');
      await this.settingsModel.create({
        companyName: 'Jiyo Life Travels',
        phone: '+91-92892 28555',
        email: 'info@jiyolifetravels.com',
        address: 'Tower 21 Pocket 14, Sector 24, Rohini, Delhi, India',
        whatsappNumber: '+91-92892 28555',
        facebookUrl: 'https://www.facebook.com/share/1asni32Bye/',
        instagramUrl: 'https://www.instagram.com/jiyolife_travel/',
        youtubeUrl: 'https://youtube.com',
        linkedinUrl: 'https://linkedin.com',
        metaTitle: 'Jiyo Life Travels - Best Travel Agency in Delhi',
        metaDescription: 'Making every destination easy to reach, memorable to experience, and extraordinary to remember. Book manual customized tour packages.',
        googleAnalyticsCode: 'G-XXXXXXXXXX',
      });
      console.log('Default settings seeded successfully!');
    }
  }

  async getSettings(): Promise<any> {
    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = await this.settingsModel.create({ companyName: 'Jiyo Life Travel' });
    }
    return settings;
  }

  async updateSettings(updateDto: any): Promise<any> {
    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = new this.settingsModel(updateDto);
      return settings.save();
    }
    return this.settingsModel.findByIdAndUpdate(settings._id, updateDto, { new: true }).exec();
  }
}
