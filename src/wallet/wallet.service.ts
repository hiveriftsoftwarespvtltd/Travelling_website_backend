import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';

const AUTH_URL = 'http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate';
const BALANCE_URL = 'http://Sharedapi.tektravels.com/SharedData.svc/rest/GetAgencyBalance';

const AUTH_CREDENTIALS = {
  ClientId: 'ApiIntegrationNew',
  UserName: 'Lifejiyo',
  Password: 'Lifejiyo@123',
};

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  private async getToken(endUserIp: string): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      return this.cachedToken;
    }

    try {
      const response = await axios.post(
        AUTH_URL,
        { ...AUTH_CREDENTIALS, EndUserIp: endUserIp },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
      );

      const data = response.data;
      if (data.Status !== 1 || !data.TokenId) {
        throw new HttpException(
          `TBO Auth failed: ${data.Error?.ErrorMessage || 'Unknown error'}`,
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.cachedToken = data.TokenId;
      this.tokenExpiry = now + 3 * 60 * 60 * 1000;
      this.logger.log(`✅ TBO Wallet Token obtained`);
      return data.TokenId;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to authenticate with TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  async getAgencyBalance(endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ClientId: AUTH_CREDENTIALS.ClientId,
      EndUserIp: endUserIp,
      TokenAgencyId: 8428,
      TokenMemberId: 9611,
      TokenId: tokenId,
    };

    this.logger.log(`💰 Checking Agency Balance for IP: ${endUserIp}`);

    try {
      const response = await axios.post(BALANCE_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      this.logger.error('❌ GetAgencyBalance error', error?.message);
      throw new HttpException('Failed to fetch agency balance', HttpStatus.BAD_GATEWAY);
    }
  }
}
