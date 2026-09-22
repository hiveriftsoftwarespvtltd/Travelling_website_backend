import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OfferService } from './offer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OfferDto, UpdateOfferDto } from './dto/offer.dto';

@Controller('offers')
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Get()
  async getOffers(@Query('status') status?: string) {
    return this.offerService.findAll(status);
  }

  @Get(':id')
  async getOffer(@Param('id') id: string) {
    return this.offerService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createOffer(@Body() offerDto: OfferDto) {
    return this.offerService.create(offerDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateOffer(@Param('id') id: string, @Body() offerDto: UpdateOfferDto) {
    return this.offerService.update(id, offerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteOffer(@Param('id') id: string) {
    return this.offerService.remove(id);
  }
}
