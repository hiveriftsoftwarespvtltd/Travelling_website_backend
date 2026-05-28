import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { BannerService } from './banner.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateBannersDto } from './dto/banner.dto';

@Controller('banner')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  async getBanners() {
    return this.bannerService.findAll();
  }

  @Put()
  @UseGuards(JwtAuthGuard) // Protect with JWT Auth Guard
  async updateBanners(@Body() updateBannersDto: UpdateBannersDto) {
    return this.bannerService.updateAll(updateBannersDto.slides);
  }
}
