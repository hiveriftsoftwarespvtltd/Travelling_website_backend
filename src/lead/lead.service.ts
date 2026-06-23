import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead, LeadDocument } from './lead.schema';

@Injectable()
export class LeadService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
  ) {}

  async create(createLeadDto: { name: string; email?: string; mobile?: string; source: string; status?: string }): Promise<Lead> {
    const newLead = new this.leadModel(createLeadDto);
    return newLead.save();
  }

  async findAll(): Promise<Lead[]> {
    return this.leadModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<any> {
    return this.leadModel.findById(id).exec();
  }

  async updateStatus(id: string, status: string): Promise<any> {
    return this.leadModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
  }

  async remove(id: string): Promise<any> {
    return this.leadModel.findByIdAndDelete(id).exec();
  }
}
