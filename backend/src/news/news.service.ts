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

  async create(createNewsDto: CreateNewsDto, currentUserId: string): Promise<News> {
    const news = this.newsRepository.create(createNewsDto);
    const savedNews = await this.newsRepository.save(news);

    // Audit log
    await this.logAuditAction(currentUserId, 'CREATE_NEWS', 'News', savedNews.id, {
      title: savedNews.title,
    });

    return savedNews;
  }

  async update(id: string, updateNewsDto: UpdateNewsDto, currentUserId: string): Promise<News> {
    const news = await this.findOne(id);

    Object.assign(news, updateNewsDto);
    const savedNews = await this.newsRepository.save(news);

    // Audit log
    await this.logAuditAction(currentUserId, 'UPDATE_NEWS', 'News', savedNews.id, updateNewsDto);

    return savedNews;
  }

  async remove(id: string, currentUserId: string): Promise<{ message: string }> {
    const news = await this.findOne(id);

    await this.newsRepository.remove(news);

    // Audit log
    await this.logAuditAction(currentUserId, 'DELETE_NEWS', 'News', id, { title: news.title });

    return { message: 'Actualité supprimée avec succès' };
  }

  private async logAuditAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
  ) {
    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      details,
    });
    await this.auditLogRepository.save(auditLog);
  }
}
