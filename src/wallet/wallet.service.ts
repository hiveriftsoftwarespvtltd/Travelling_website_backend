import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';

function normalizeTboUrl(
  baseUrl: string | undefined,
  defaultBase: string,
  endpoint: string,
): string {
  let base = (baseUrl || defaultBase).trim().replace(/\/+$/, '');
  if (base.toLowerCase().endsWith(`/${endpoint.toLowerCase()}`)) {
    return base;
  }
  if (!base.toLowerCase().endsWith('/rest')) {
    base = `${base}/rest`;
  }
  return `${base}/${endpoint}`;
}

const getAuthUrl = () =>
  normalizeTboUrl(
    process.env.TBO_AUTH_BASE_URL,
    'http://Sharedapi.tektravels.com/SharedData.svc/rest',
    'Authenticate',
  );

const getBalanceUrl = () =>
  normalizeTboUrl(
    process.env.TBO_AUTH_BASE_URL,
    'http://Sharedapi.tektravels.com/SharedData.svc/rest',
    'GetAgencyBalance',
  );

const getAuthCredentials = () => ({
  ClientId: process.env.TBO_CLIENT_ID || 'ApiIntegrationNew',
  UserName: process.env.TBO_USERNAME || 'Lifejiyo',
  Password: process.env.TBO_PASSWORD || 'Lifejiyo@123',
});

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
      const credentials = getAuthCredentials();
      const response = await axios.post(
        getAuthUrl(),
        { ...credentials, EndUserIp: endUserIp },
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
      throw new HttpException(
        'Failed to authenticate with TBO API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getAgencyBalance(endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);
    const credentials = getAuthCredentials();

    const payload = {
      ClientId: credentials.ClientId,
      EndUserIp: endUserIp,
      TokenAgencyId: 8428,
      TokenMemberId: 9611,
      TokenId: tokenId,
    };

    this.logger.log(`💰 Checking Agency Balance for IP: ${endUserIp}`);

    try {
      const response = await axios.post(getBalanceUrl(), payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      this.logger.error('❌ GetAgencyBalance error', error?.message);
      throw new HttpException(
        'Failed to fetch agency balance',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
