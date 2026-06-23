import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactEnquiry, ContactEnquirySchema } from './contact-enquiry.schema';
import { ContactEnquiryService } from './contact-enquiry.service';
import { ContactEnquiryController } from './contact-enquiry.controller';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ContactEnquiry.name, schema: ContactEnquirySchema }]),
    LeadModule,
  ],
  controllers: [ContactEnquiryController],
  providers: [ContactEnquiryService],
  exports: [ContactEnquiryService],
})
export class ContactEnquiryModule {}
