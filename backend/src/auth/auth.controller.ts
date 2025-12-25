import { Controller, Post, Body, Get, UseGuards, Request, Ip } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Ip() ip: string, @Request() req) {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || ip;
    return this.authService.login(loginDto, clientIp);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  async logout(@Request() req, @Ip() ip: string) {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || ip;
    return this.authService.logout(req.user.id, clientIp);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }
}
