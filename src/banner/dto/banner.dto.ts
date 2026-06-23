import { IsNotEmpty, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BannerSlideDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  subTitle: string;

  @IsString()
  @IsNotEmpty()
  bgImage: string;

  @IsString()
  buttonText?: string;

  @IsString()
  buttonLink?: string;

  @IsString()
  status?: string;
}

export class UpdateBannersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BannerSlideDto)
  slides: BannerSlideDto[];
}
