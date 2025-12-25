import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/create-user.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  private getClientIp(req: any, ip: string): string {
    return req.headers['x-forwarded-for']?.split(',')[0] || ip;
  }

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN)
  async findAll(@Request() req, @Query('companyId') companyId?: string) {
    return this.usersService.findAll(req.user, companyId);
  }

  @Get(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN)
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.CLIENT_ADMIN)
  async create(@Body() createUserDto: CreateUserDto, @Request() req, @Ip() ip: string) {
    // FULL_ADMIN cannot create SYSTEM_ADMIN users
    if (req.user.role === UserRole.FULL_ADMIN && createUserDto.role === UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Vous n\'avez pas la permission de créer un Super Admin');
    }
    return this.usersService.create(createUserDto, req.user.id, this.getClientIp(req, ip));
  }

  @Put(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.CLIENT_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    // FULL_ADMIN cannot update to SYSTEM_ADMIN role
    if (req.user.role === UserRole.FULL_ADMIN && updateUserDto.role === UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Vous n\'avez pas la permission de définir le rôle Super Admin');
    }
    // FULL_ADMIN cannot edit SYSTEM_ADMIN users
    if (req.user.role === UserRole.FULL_ADMIN) {
      const targetUser = await this.usersService.findOne(id);
      if (targetUser.role === UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('Vous n\'avez pas la permission de modifier un Super Admin');
      }
    }
    return this.usersService.update(id, updateUserDto, req.user.id, this.getClientIp(req, ip));
  }

  @Patch(':id/status')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.CLIENT_ADMIN)
  async toggleStatus(@Param('id') id: string, @Request() req, @Ip() ip: string) {
    // FULL_ADMIN cannot toggle SYSTEM_ADMIN status
    if (req.user.role === UserRole.FULL_ADMIN) {
      const targetUser = await this.usersService.findOne(id);
      if (targetUser.role === UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('Vous n\'avez pas la permission de modifier un Super Admin');
      }
    }
    return this.usersService.toggleStatus(id, req.user.id, this.getClientIp(req, ip));
  }

  @Post(':id/reset-password')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN, UserRole.CLIENT_ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
    @Request() req,
    @Ip() ip: string,
  ) {
    // FULL_ADMIN cannot reset SYSTEM_ADMIN password
    if (req.user.role === UserRole.FULL_ADMIN) {
      const targetUser = await this.usersService.findOne(id);
      if (targetUser.role === UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('Vous n\'avez pas la permission de modifier un Super Admin');
      }
    }
    return this.usersService.resetPassword(id, resetPasswordDto, req.user.id, this.getClientIp(req, ip));
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.FULL_ADMIN)
  async remove(
    @Param('id') id: string,
    @Query('force') force: string,
    @Request() req,
    @Ip() ip: string,
  ) {
    // FULL_ADMIN cannot delete SYSTEM_ADMIN users
    if (req.user.role === UserRole.FULL_ADMIN) {
      const targetUser = await this.usersService.findOne(id);
      if (targetUser.role === UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('Vous n\'avez pas la permission de supprimer un Super Admin');
      }
    }
    // Only SYSTEM_ADMIN can force delete
    const forceDelete = force === 'true' && req.user.role === UserRole.SYSTEM_ADMIN;
    return this.usersService.remove(id, req.user.id, forceDelete, this.getClientIp(req, ip));
  }
}
