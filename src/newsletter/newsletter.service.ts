import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Newsletter, NewsletterDocument } from './newsletter.schema';
import { LeadService } from '../lead/lead.service';

@Injectable()
export class NewsletterService {
  constructor(
    @InjectModel(Newsletter.name) private newsletterModel: Model<NewsletterDocument>,
    private readonly leadService: LeadService,
  ) {}

  async subscribe(email: string): Promise<Newsletter> {
    const existing = await this.newsletterModel.findOne({ email }).exec();
    if (existing) {
      throw new ConflictException('Email already subscribed');
    }

    const newSub = new this.newsletterModel({ email });
    const saved = await newSub.save();

    // Auto-generate consolidated lead
    await this.leadService.create({
      name: saved.email.split('@')[0], // Use prefix as default name
      email: saved.email,
      source: 'Newsletter',
      status: 'New',
    });

    return saved;
  }

  async findAll(): Promise<Newsletter[]> {
    return this.newsletterModel.find().sort({ createdAt: -1 }).exec();
  }

  async remove(id: string): Promise<any> {
    return this.newsletterModel.findByIdAndDelete(id).exec();
  }
}
