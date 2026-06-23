import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Newsletter, NewsletterSchema } from './newsletter.schema';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { LeadModule } from '../lead/lead.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Newsletter.name, schema: NewsletterSchema }]),
    LeadModule,
  ],
  controllers: [NewsletterController],
  providers: [NewsletterService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
