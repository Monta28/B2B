import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body size limit for base64 images (50MB)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Ports from environment
  const backendPort = process.env.BACKEND_PORT || process.env.PORT || 4001;
  const frontendPort = process.env.FRONTEND_PORT || 4000;

  // Enable CORS for frontend
  const defaultOrigins = [
    `http://localhost:${frontendPort}`,
    `http://localhost:${backendPort}`,
    'http://localhost',
    'http://localhost:80',
  ];
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : defaultOrigins;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Global prefix
  app.setGlobalPrefix('api');

  await app.listen(backendPort);
  console.log(`🚀 Backend running on http://localhost:${backendPort}/api`);
}
bootstrap();
