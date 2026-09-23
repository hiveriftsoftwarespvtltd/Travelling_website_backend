import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('upload')
export class UploadController {
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `file-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        const allowedExtensions = /\.(jpe?g|png|gif|webp)$/i;
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
        ];

        if (
          !allowedExtensions.test(file.originalname) ||
          !allowedMimes.includes(file.mimetype)
        ) {
          return callback(
            new BadRequestException(
              'Only valid image files (JPG, PNG, GIF, WEBP) are allowed!',
            ),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded or file is not allowed');
    }
    const baseUrl =
      process.env.SERVER_BASE_URL ||
      process.env.BACKEND_URL ||
      'https://jiyolifetravel.com/jiyolife_api';
    const fileUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${file.filename}`;
    return { url: fileUrl };
  }
}
