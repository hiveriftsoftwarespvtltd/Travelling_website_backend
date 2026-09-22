import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(loginDto);
    return this.authService.login(user);
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify-email')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() verifyDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyDto);
  }

  @Post('forgot-password')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() updateDto: any) {
    return this.authService.updateProfile(req.user.userId, updateDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: any, @Body() changePassDto: any) {
    return this.authService.changePassword(req.user.userId, changePassDto);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAllUsers() {
    return this.authService.getAllUsers();
  }
}
