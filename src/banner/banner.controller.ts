import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { BannerService } from './banner.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UpdateBannersDto } from './dto/banner.dto';

@Controller('banner')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  async getBanners() {
    return this.bannerService.findAll();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateBanners(@Body() updateBannersDto: UpdateBannersDto) {
    return this.bannerService.updateAll(updateBannersDto.slides);
  }
}
