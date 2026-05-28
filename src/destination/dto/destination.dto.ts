import { IsNotEmpty, IsNumber, IsString, Min, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class DestinationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  listings?: number;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsString()
  @IsOptional()
  price?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsString()
  @IsOptional()
  bannerImg?: string;

  @IsString()
  @IsOptional()
  pageTitle?: string;

  @IsString()
  @IsOptional()
  description1?: string;

  @IsString()
  @IsOptional()
  description2?: string;

  @IsString()
  @IsOptional()
  basicInfoText?: string;

  @IsString()
  @IsOptional()
  visaRequirements?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  area?: string;

  @IsString()
  @IsOptional()
  tourPlaces?: string;

  @IsString()
  @IsOptional()
  quoteText?: string;

  @IsString()
  @IsOptional()
  quoteAuthor?: string;

  @IsString()
  @IsOptional()
  description3?: string;

  @IsString()
  @IsOptional()
  description4?: string;

  @IsString()
  @IsOptional()
  highlightsTitle?: string;

  @IsString()
  @IsOptional()
  highlightsText?: string;

  @IsString()
  @IsOptional()
  innerImage?: string;

  @IsArray()
  @IsOptional()
  highlights?: string[];

  @IsArray()
  @IsOptional()
  gallery?: string[];

  @IsBoolean()
  @IsOptional()
  isPopularTour?: boolean;
}
