import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  private getValidIp(req: Request): string {
    const rawIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '192.168.11.120';
    if (rawIp.includes(':')) return '192.168.11.120';
    return rawIp;
  }

  @Get('balance')
  @Roles('admin')
  async getAgencyBalance(@Req() req: Request) {
    return this.walletService.getAgencyBalance(this.getValidIp(req));
  }
}
