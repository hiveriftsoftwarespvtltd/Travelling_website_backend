import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { TravelToken, TravelTokenDocument } from './token.schema';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly PROVIDER_NAME = 'travel-api';

  constructor(
    @InjectModel(TravelToken.name) private tokenModel: Model<TravelTokenDocument>,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  /**
   * Retrieves a valid token from DB or fetches a new one if missing/expired.
   */
  async getValidToken(): Promise<string> {
    const cachedToken = await this.tokenModel.findOne({ provider: this.PROVIDER_NAME });
    
    // If token exists and is valid (not expiring within the next 5 mins)
    if (cachedToken && cachedToken.isActive && cachedToken.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
      this.logger.debug('Using cached travel API token.');
      return cachedToken.tokenId;
    }

    this.logger.log('Token missing or expired. Authenticating with Travel API...');
    return this.authenticate();
  }

  /**
   * Authenticates with Travel API, caches the new token, and returns it.
   */
  async authenticate(): Promise<string> {
    const clientId = this.configService.get<string>('TRAVEL_CLIENT_ID');
    const username = this.configService.get<string>('TRAVEL_USERNAME');
    const password = this.configService.get<string>('TRAVEL_PASSWORD');
    const endUserIp = this.configService.get<string>('END_USER_IP');
    const apiUrl = this.configService.get<string>('TRAVEL_API_BASE_URL');

    // Normally this is the endpoint for TBO/Travel API auth:
    const authEndpoint = `${apiUrl}/Authenticate`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(authEndpoint, {
          ClientId: clientId,
          UserName: username,
          Password: password,
          EndUserIp: endUserIp,
        })
      );

      const data = response.data;

      // Assuming API returns Error.ErrorCode === 0 on success and TokenId
      if (data && data.Status === 1 && data.TokenId) {
        // Typically tokens are valid for 24 hours, but check API documentation.
        // Assuming 24 hours for now, adjust based on actual API response if it provides expiry time.
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 23); // Set to expire in 23 hours to be safe

        // Upsert into MongoDB
        await this.tokenModel.findOneAndUpdate(
          { provider: this.PROVIDER_NAME },
          {
            tokenId: data.TokenId,
            expiresAt,
            isActive: true,
          },
          { upsert: true, new: true }
        );

        this.logger.log('Successfully authenticated and cached new token.');
        return data.TokenId;
      } else {
        this.logger.error(`Travel API Authentication failed: ${JSON.stringify(data.Error)}`);
        throw new Error(data.Error?.ErrorMessage || 'Failed to authenticate');
      }
    } catch (error) {
      this.logger.error(`Error connecting to Travel API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Force refreshes the token. Useful when auto-retry logic intercepts an Invalid Token error.
   */
  async refreshToken(): Promise<string> {
    this.logger.warn('Forcing token refresh due to invalid token error...');
    return this.authenticate();
  }
}
