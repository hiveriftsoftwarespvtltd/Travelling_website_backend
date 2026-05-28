import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class GalleryDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsOptional()
  title?: string;
}
