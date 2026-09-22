import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class OfferDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsNotEmpty()
  discount: string;

  @IsString()
  @IsOptional()
  desc?: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  expiry?: string;

  @IsString()
  @IsOptional()
  link?: string;

  @IsString()
  @IsOptional()
  badge?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateOfferDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  discount?: string;

  @IsString()
  @IsOptional()
  desc?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  expiry?: string;

  @IsString()
  @IsOptional()
  link?: string;

  @IsString()
  @IsOptional()
  badge?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
