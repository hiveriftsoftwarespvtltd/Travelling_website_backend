import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class BlogDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsString()
  @IsOptional()
  bannerImg?: string;

  @IsString()
  @IsNotEmpty()
  shortDescription: string;

  @IsString()
  @IsNotEmpty()
  content1: string;

  @IsString()
  @IsOptional()
  quoteText?: string;

  @IsString()
  @IsOptional()
  quoteAuthor?: string;

  @IsString()
  @IsOptional()
  content2?: string;

  @IsString()
  @IsOptional()
  innerImage?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];
}
