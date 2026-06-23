import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  @IsNotEmpty()
  destinationId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsNumber()
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  customerImage?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
