import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GalleryDto } from './dto/gallery.dto';

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  async getGallery() {
    return this.galleryService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createGallery(@Body() galleryDto: GalleryDto) {
    return this.galleryService.create(galleryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteGallery(@Param('id') id: string) {
    return this.galleryService.remove(id);
  }
}
