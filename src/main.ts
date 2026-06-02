import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS - allow all origins (browser-safe: no credentials conflict)
  app.enableCors({
    origin: true,  // reflects the request origin — works with all browsers
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: false,
  });

  // Increase payload size limit
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Global validation pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Create uploads directory if not exists
  const uploadsDir = join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  // Serve static files from uploads folder
  app.use('/uploads', express.static(uploadsDir));

  // Set global API prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 8009;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
  // Restarted to load samunder2611@gmail.com credentials
}
bootstrap();
