import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogDto } from './dto/blog.dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post()
  create(@Body() blogDto: BlogDto) {
    return this.blogService.create(blogDto);
  }

  @Get()
  findAll() {
    return this.blogService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blogService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() blogDto: BlogDto) {
    return this.blogService.update(id, blogDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blogService.delete(id);
  }
}
