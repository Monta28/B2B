import { IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { NewsType } from '../../entities/news.entity';

export class CreateNewsDto {
  @IsNotEmpty()
  title: string;

  @IsNotEmpty()
  content: string;

  @IsEnum(NewsType)
  type: NewsType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNewsDto {
  @IsOptional()
  title?: string;

  @IsOptional()
  content?: string;

  @IsOptional()
  @IsEnum(NewsType)
  type?: NewsType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
