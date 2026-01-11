import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../entities/news.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CreateNewsDto, UpdateNewsDto } from './dto/create-news.dto';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private newsRepository: Repository<News>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async findAll(activeOnly: boolean = false): Promise<News[]> {
    const queryBuilder = this.newsRepository.createQueryBuilder('news');

    if (activeOnly) {
      queryBuilder.where('news.isActive = :isActive', { isActive: true });
    }

    return queryBuilder.orderBy('news.createdAt', 'DESC').getMany();
  }

  async findOne(id: string): Promise<News> {
    const news = await this.newsRepository.findOne({
      where: { id },
    });

    if (!news) {
      throw new NotFoundException('Actualité non trouvée');
    }

    return news;
  }

  async create(createNewsDto: CreateNewsDto, currentUserId: string, ipAddress?: string): Promise<News> {
    const newsData: Partial<News> = {
      title: createNewsDto.title,
      content: createNewsDto.content,
      type: createNewsDto.type,
      isActive: createNewsDto.isActive,
    };
    if (createNewsDto.publishDate) {
      newsData.publishDate = new Date(createNewsDto.publishDate);
    }
    const news = this.newsRepository.create(newsData);
    const savedNews = await this.newsRepository.save(news);

    // Audit log
    await this.logAuditAction(currentUserId, 'CREATE_NEWS', 'News', savedNews.id, {
      title: savedNews.title,
    }, ipAddress);

    return savedNews;
  }

  async update(id: string, updateNewsDto: UpdateNewsDto, currentUserId: string, ipAddress?: string): Promise<News> {
    const news = await this.findOne(id);

    if (updateNewsDto.title !== undefined) news.title = updateNewsDto.title;
    if (updateNewsDto.content !== undefined) news.content = updateNewsDto.content;
    if (updateNewsDto.type !== undefined) news.type = updateNewsDto.type;
    if (updateNewsDto.isActive !== undefined) news.isActive = updateNewsDto.isActive;
    if (updateNewsDto.publishDate) news.publishDate = new Date(updateNewsDto.publishDate);

    const savedNews = await this.newsRepository.save(news);

    // Audit log
    await this.logAuditAction(currentUserId, 'UPDATE_NEWS', 'News', savedNews.id, updateNewsDto, ipAddress);

    return savedNews;
  }

  async remove(id: string, currentUserId: string, ipAddress?: string): Promise<{ message: string }> {
    const news = await this.findOne(id);

    await this.newsRepository.remove(news);

    // Audit log
    await this.logAuditAction(currentUserId, 'DELETE_NEWS', 'News', id, { title: news.title }, ipAddress);

    return { message: 'Actualité supprimée avec succès' };
  }

  private async logAuditAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
    ipAddress?: string,
  ) {
    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
    });
    await this.auditLogRepository.save(auditLog);
  }
}
