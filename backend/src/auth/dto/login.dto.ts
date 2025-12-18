import { IsNotEmpty, MinLength, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  email: string; // Can be email or username

  @IsNotEmpty()
  @MinLength(4)
  password: string;
}
