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
import { DestinationService } from './destination.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DestinationDto } from './dto/destination.dto';

@Controller('destinations')
export class DestinationController {
  constructor(private readonly destinationService: DestinationService) {}

  @Get()
  async getDestinations() {
    return this.destinationService.findAll();
  }

  @Get(':id')
  async getDestination(@Param('id') id: string) {
    return this.destinationService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createDestination(@Body() destinationDto: DestinationDto) {
    return this.destinationService.create(destinationDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateDestination(
    @Param('id') id: string,
    @Body() destinationDto: DestinationDto,
  ) {
    return this.destinationService.update(id, destinationDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteDestination(@Param('id') id: string) {
    return this.destinationService.remove(id);
  }
}
