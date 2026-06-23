import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ContactEnquiryService } from './contact-enquiry.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('contact-enquiries')
export class ContactEnquiryController {
  constructor(private readonly contactEnquiryService: ContactEnquiryService) {}

  @Post()
  create(@Body() createDto: any) {
    return this.contactEnquiryService.create(createDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.contactEnquiryService.findAll();
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.contactEnquiryService.updateStatus(id, status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.contactEnquiryService.remove(id);
  }
}
