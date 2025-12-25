import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private jwtService: JwtService,
  ) {}

  async validateUser(identifier: string, password: string): Promise<User | null> {
    // Try to find user by email first, then by username
    let user = await this.userRepository.findOne({
      where: { email: identifier },
      relations: ['company'],
    });

    // If not found by email, try username
    if (!user) {
      user = await this.userRepository.findOne({
        where: { username: identifier },
        relations: ['company'],
      });
    }

    if (user && user.isActive && (await bcrypt.compare(password, user.passwordHash))) {
      return user;
    }
    return null;
  }

  async login(loginDto: LoginDto, ipAddress?: string) {
    // loginDto.email can be either email or username
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    // Check if company is active (for client users)
    if (user.company && !user.company.isActive) {
      throw new UnauthorizedException('Votre entreprise est désactivée');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company?.id,
      dmsClientCode: user.dmsClientCode,
    };

    // Log login action
    await this.logAuditAction(user.id, 'LOGIN', 'User', user.id, null, ipAddress);

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.company?.id,
        companyName: user.company?.name || 'MECACOMM HQ',
        dmsClientCode: user.dmsClientCode,
        globalDiscount: user.company?.globalDiscount || 0,
      },
    };
  }

  async logout(userId: string, ipAddress?: string) {
    await this.logAuditAction(userId, 'LOGOUT', 'User', userId, null, ipAddress);
    return { message: 'Déconnexion réussie' };
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['company'],
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      companyId: user.company?.id,
      companyName: user.company?.name || 'MECACOMM HQ',
      dmsClientCode: user.dmsClientCode,
      globalDiscount: user.company?.globalDiscount || 0,
    };
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
