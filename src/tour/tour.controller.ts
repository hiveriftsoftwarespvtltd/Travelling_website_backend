import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { TourService } from './tour.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TourDto } from './dto/tour.dto';

@Controller('tours')
export class TourController {
  constructor(private readonly tourService: TourService) {}

  @Get()
  async getTours() {
    return this.tourService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createTour(@Body() tourDto: TourDto) {
    return this.tourService.create(tourDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateTour(@Param('id') id: string, @Body() tourDto: TourDto) {
    return this.tourService.update(id, tourDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteTour(@Param('id') id: string) {
    return this.tourService.remove(id);
  }
}
