import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactEnquiry, ContactEnquiryDocument } from './contact-enquiry.schema';
import { LeadService } from '../lead/lead.service';

@Injectable()
export class ContactEnquiryService {
  constructor(
    @InjectModel(ContactEnquiry.name) private enquiryModel: Model<ContactEnquiryDocument>,
    private readonly leadService: LeadService,
  ) {}

  async create(createDto: any): Promise<ContactEnquiry> {
    const newEnquiry = new this.enquiryModel(createDto);
    const saved = await newEnquiry.save();

    // Auto-create consolidated lead
    await this.leadService.create({
      name: saved.name,
      email: saved.email,
      mobile: saved.mobile,
      source: 'Contact Form',
      status: 'New',
    });

    return saved;
  }

  async findAll(): Promise<ContactEnquiry[]> {
    return this.enquiryModel.find().sort({ createdAt: -1 }).exec();
  }

  async updateStatus(id: string, status: string): Promise<ContactEnquiry> {
    const updated = await this.enquiryModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`Enquiry with ID ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<any> {
    const result = await this.enquiryModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Enquiry with ID ${id} not found`);
    }
    return result;
  }
}
