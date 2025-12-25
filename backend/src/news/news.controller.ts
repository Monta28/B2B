import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NewsService } from './news.service';
import { CreateNewsDto, UpdateNewsDto } from './dto/create-news.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('news')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NewsController {
  constructor(private newsService: NewsService) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.newsService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async create(@Body() createNewsDto: CreateNewsDto, @Request() req, @Ip() ip: string) {
    return this.newsService.create(createNewsDto, req.user.id, this.getClientIp(req, ip));
  }

  @Put(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateNewsDto: UpdateNewsDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    return this.newsService.update(id, updateNewsDto, req.user.id, this.getClientIp(req, ip));
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async remove(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    return this.newsService.remove(id, req.user.id, this.getClientIp(req, ip));
  }
}
