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

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN)
  async findAll(@Request() req, @Query('companyId') companyId?: string) {
    return this.usersService.findAll(req.user, companyId);
  }

  @Get(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN, UserRole.CLIENT_ADMIN)
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.CLIENT_ADMIN)
  async create(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.usersService.create(createUserDto, req.user.id);
  }

  @Put(':id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.CLIENT_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ) {
    return this.usersService.update(id, updateUserDto, req.user.id);
  }

  @Patch(':id/status')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.CLIENT_ADMIN)
  async toggleStatus(@Param('id') id: string, @Request() req) {
    return this.usersService.toggleStatus(id, req.user.id);
  }

  @Post(':id/reset-password')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.CLIENT_ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
    @Request() req,
  ) {
    return this.usersService.resetPassword(id, resetPasswordDto, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  async remove(@Param('id') id: string, @Request() req) {
    return this.usersService.remove(id, req.user.id);
  }
}
