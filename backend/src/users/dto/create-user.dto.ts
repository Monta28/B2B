import { IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { UserRole } from '../../entities/user.entity';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  username?: string;

  @IsNotEmpty()
  @MinLength(4)
  password: string;

  @IsNotEmpty()
  fullName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  dmsClientCode?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  username?: string;

  @IsOptional()
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @ValidateIf((o) => o.companyId !== null)
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  dmsClientCode?: string;

  @IsOptional()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @MinLength(4)
  newPassword: string;
}
