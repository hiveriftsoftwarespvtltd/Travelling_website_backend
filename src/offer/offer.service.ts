import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Settings, SettingsDocument } from '../settings/settings.schema';
import { OfferDto, UpdateOfferDto } from './dto/offer.dto';

const defaultOffers = [
  {
    _id: new Types.ObjectId().toString(),
    category: 'Holiday Packages',
    title: 'Winter & Spring Escapes',
    discount: 'UP TO ₹4,000 OFF',
    desc: 'Valid on all all-inclusive Kashmir, Manali & Kerala bespoke holiday packages.',
    code: 'JIYOFESTIVE',
    expiry: 'Ends in 4 days',
    link: '/destination',
    badge: 'Trending Deal',
    status: 'Active',
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: new Types.ObjectId().toString(),
    category: 'Flight Ticketing',
    title: 'Zero Convenience Fees',
    discount: 'FLAT ₹800 OFF',
    desc: 'Instant discount on domestic round-trips & zero convenience fee on international flights.',
    code: 'JIYOFLYFREE',
    expiry: 'Valid this week',
    link: '/flights',
    badge: 'Popular',
    status: 'Active',
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: new Types.ObjectId().toString(),
    category: 'Luxury Stays',
    title: '5★ Resort Privilege',
    discount: 'FREE ROOM UPGRADE',
    desc: 'Complimentary room upgrade & breakfast on 3+ night bookings at Goa & Dubai resorts.',
    code: 'JIYOLUXURY',
    expiry: 'Limited vouchers',
    link: '/hotels',
    badge: 'Exclusive',
    status: 'Active',
    sortOrder: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: new Types.ObjectId().toString(),
    category: 'Visa & Insurance',
    title: 'Global Travel Protection',
    discount: 'FREE INSURANCE',
    desc: 'Complimentary 7-day international travel insurance on every European & Asian package.',
    code: 'JIYOSAFE',
    expiry: 'Ongoing perk',
    link: '/contact',
    badge: 'Complimentary',
    status: 'Active',
    sortOrder: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

@Injectable()
export class OfferService implements OnModuleInit {
  constructor(
    @InjectModel(Settings.name)
    private settingsModel: Model<SettingsDocument>,
  ) {}

  private async getSettings(): Promise<SettingsDocument> {
    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = await this.settingsModel.create({
        companyName: 'Jiyo Life Travels',
        offers: defaultOffers,
      });
    }
    return settings;
  }

  async onModuleInit() {
    try {
      const settings = await this.getSettings();
      if (!settings.offers || settings.offers.length === 0) {
        settings.offers = defaultOffers;
        await settings.save();
        console.log('Seeded default promotional offers into settings!');
      }
    } catch (err) {
      console.error('Error initializing offers in settings:', err);
    }
  }

  async findAll(status?: string): Promise<any[]> {
    const settings = await this.getSettings();
    let offers = settings.offers || [];
    if (status && status !== 'all') {
      offers = offers.filter((o) => o.status === status);
    }
    return offers.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async findOne(id: string): Promise<any> {
    const settings = await this.getSettings();
    const offer = (settings.offers || []).find((o) => String(o._id) === String(id));
    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }
    return offer;
  }

  async create(offerDto: OfferDto): Promise<any> {
    const settings = await this.getSettings();
    const newOffer = {
      _id: new Types.ObjectId().toString(),
      ...offerDto,
      status: offerDto.status || 'Active',
      sortOrder: offerDto.sortOrder || (settings.offers?.length || 0) + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    settings.offers = [...(settings.offers || []), newOffer];
    settings.markModified('offers');
    await settings.save();
    return newOffer;
  }

  async update(id: string, offerDto: UpdateOfferDto): Promise<any> {
    const settings = await this.getSettings();
    const index = (settings.offers || []).findIndex((o) => String(o._id) === String(id));
    if (index === -1) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }
    const updatedOffer = {
      ...settings.offers[index],
      ...offerDto,
      updatedAt: new Date(),
    };
    settings.offers[index] = updatedOffer;
    settings.markModified('offers');
    await settings.save();
    return updatedOffer;
  }

  async remove(id: string): Promise<any> {
    const settings = await this.getSettings();
    const initialLen = settings.offers?.length || 0;
    settings.offers = (settings.offers || []).filter((o) => String(o._id) !== String(id));
    if (settings.offers.length === initialLen) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }
    settings.markModified('offers');
    await settings.save();
    return { success: true, message: 'Offer deleted successfully' };
  }
}
