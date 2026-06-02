import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../token/token.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TravelApiService {
  private readonly logger = new Logger(TravelApiService.name);
  private readonly apiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {
    this.apiUrl = this.configService.get<string>('TRAVEL_API_BASE_URL');
  }

  /**
   * Helper function to execute a request, handling token injection and auto-retry on token expiry.
   */
  private async executeRequest<T>(
    endpoint: string,
    payload: any,
    isRetry = false,
  ): Promise<T> {
    try {
      // 1. Get a valid token (from DB or freshly fetched)
      const token = await this.tokenService.getValidToken();

      // 2. Attach token and IP to the payload
      const requestPayload = {
        ...payload,
        TokenId: token,
        EndUserIp: this.configService.get<string>('END_USER_IP'),
      };

      const url = `${this.apiUrl}${endpoint}`;
      this.logger.debug(`Making request to ${url}`);

      // 3. Make the actual HTTP request
      const response = await firstValueFrom(this.httpService.post<T>(url, requestPayload));
      const data: any = response.data;

      // 4. Check if the response contains an Invalid Token Error
      // Assuming ErrorCode 5 means Invalid Token (adjust based on actual provider's documentation)
      if (data && data.Error && data.Error.ErrorCode === 5) {
        if (!isRetry) {
          this.logger.warn('Token expired or invalid. Auto-refreshing and retrying...');
          await this.tokenService.refreshToken();
          return this.executeRequest<T>(endpoint, payload, true);
        } else {
          throw new Error('Failed even after retrying with a fresh token');
        }
      }

      // Return the successful data
      return data;
    } catch (error) {
      this.logger.error(`Error in TravelApiService for endpoint ${endpoint}: ${error.message}`);
      throw error;
    }
  }

  // Domain-specific methods delegating to the generic executeRequest

  async searchFlight(searchData: any) {
    return this.executeRequest('/Search', searchData);
  }

  async fareQuote(quoteData: any) {
    return this.executeRequest('/FareQuote', quoteData);
  }

  async bookFlight(bookingData: any) {
    return this.executeRequest('/Book', bookingData);
  }

  async generateTicket(ticketData: any) {
    return this.executeRequest('/Ticket', ticketData);
  }

  async cancelTicket(cancelData: any) {
    return this.executeRequest('/SendChangeRequest', cancelData);
  }
}
