import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { FlightSearchDto } from './dto/flight-search.dto';

// ─── TBO API Endpoints (from TBO Documentation) ────────────────────────────
const AUTH_URL = 'http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate';
const SEARCH_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/Search';

// ─── TBO Credentials (Backend only — never expose to frontend) ──────────────
const AUTH_CREDENTIALS = {
  ClientId: 'ApiIntegrationNew',
  UserName: 'Lifejiyo',
  Password: 'Lifejiyo@123',
};

// ─── TBO Error Codes ────────────────────────────────────────────────────────
const TBO_ERROR_TOKEN_EXPIRED = 6;
const TBO_ERROR_INVALID_TOKEN = 7;

@Injectable()
export class FlightService {
  private readonly logger = new Logger(FlightService.name);

  // In-memory token cache — valid for 3 hours (TBO tokens last longer but 3h is safe)
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  // ─── Step 1: Get Authentication Token ──────────────────────────────────────
  // Per TBO docs: POST to SharedData.svc/rest/Authenticate
  // The EndUserIp MUST be the real end user's IP (not server IP)
  // ───────────────────────────────────────────────────────────────────────────
  private async getToken(endUserIp: string): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      this.logger.log(`✅ Using cached TBO token (expires in ${Math.round((this.tokenExpiry - now) / 60000)} min)`);
      return this.cachedToken as string;
    }

    this.logger.log(`🔐 Fetching new TBO auth token for IP: ${endUserIp}`);
    try {
      const response = await axios.post(
        AUTH_URL,
        {
          ...AUTH_CREDENTIALS,
          EndUserIp: endUserIp,  // Real user IP from request
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      );

      const data = response.data;

      // TBO returns Status: 1 for success
      if (data.Status !== 1 || !data.TokenId) {
        this.logger.error('TBO Auth failed', data.Error);
        throw new HttpException(
          `TBO Auth failed: ${data.Error?.ErrorMessage || 'Unknown error'}`,
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.cachedToken = data.TokenId;
      this.tokenExpiry = now + 3 * 60 * 60 * 1000; // Cache for 3 hours

      this.logger.log(`✅ TBO Token obtained. Agent: ${data.Member?.FirstName} ${data.Member?.LastName}`);
      return this.cachedToken as string;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Auth API error', error?.message);
      throw new HttpException('Failed to authenticate with TBO flight API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 2: Search Flights ─────────────────────────────────────────────────
  // Per TBO docs: POST to AirService.svc/rest/Search
  // JourneyType: 1=OneWay, 2=Return, 3=MultiCity
  // FlightCabinClass: 1=All, 2=Economy, 3=PremiumEconomy, 4=Business, 5=PremiumBusiness, 6=First
  // ───────────────────────────────────────────────────────────────────────────
  async searchFlights(searchDto: FlightSearchDto, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,   // Real user IP
      TokenId: tokenId,        // Auto-fetched token
      AdultCount: searchDto.AdultCount,
      ChildCount: searchDto.ChildCount,
      InfantCount: searchDto.InfantCount,
      DirectFlight: searchDto.DirectFlight,
      OneStopFlight: searchDto.OneStopFlight,
      JourneyType: searchDto.JourneyType,    // 1=OneWay, 2=Return, 3=MultiCity
      PreferredAirlines: searchDto.PreferredAirlines ?? null,
      Segments: searchDto.Segments,
      Sources: searchDto.Sources ?? null,
    };

    this.logger.log(
      `🔍 TBO Flight Search: ${searchDto.Segments[0]?.Origin} → ${searchDto.Segments[0]?.Destination} | JourneyType: ${searchDto.JourneyType}`,
    );

    try {
      const response = await axios.post(SEARCH_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000, // TBO search can take up to 30-45 seconds
      });

      const data = response.data;

      // TBO returns ResponseStatus: 1 for success
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Search returned error', tboError);

        // ErrorCode 25 is "No result found". Return the response data with a successful response
        // so the frontend can handle it nicely rather than getting a 502 Bad Gateway error.
        if (tboError?.ErrorCode === 25) {
          this.logger.warn('⚠️ TBO Search: No flights found (ErrorCode 25)');
          return data;
        }

        throw new HttpException(
          tboError?.ErrorMessage || 'Flight search failed',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const flightCount = data?.Response?.Results?.[0]?.length ?? 0;
      this.logger.log(`✅ TBO Search success! Found ${flightCount} flights. TraceId: ${data?.Response?.TraceId}`);

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      // Handle TBO token expiry — clear cache and retry once
      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.searchFlights(searchDto, endUserIp); // Retry once with fresh token
      }

      this.logger.error('❌ TBO Search API error', error?.message);
      throw new HttpException('Failed to fetch flights from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 3: Get Calendar Fares ─────────────────────────────────────────────
  // Per TBO docs: POST to AirService.svc/rest/GetCalendarFare
  // Returns lowest fares for a specific route across multiple departure dates.
  // ───────────────────────────────────────────────────────────────────────────
  async getCalendarFare(searchDto: FlightSearchDto, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      JourneyType: searchDto.JourneyType || 1,
      PreferredAirlines: searchDto.PreferredAirlines ?? null,
      Segments: searchDto.Segments.map(seg => ({
        Origin: seg.Origin,
        Destination: seg.Destination,
        FlightCabinClass: seg.FlightCabinClass || 2,
        PreferredDepartureTime: seg.PreferredDepartureTime,
      })),
      Sources: searchDto.Sources ?? null,
    };

    const CALENDAR_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/GetCalendarFare';

    this.logger.log(
      `📅 TBO Calendar Fare Search: ${searchDto.Segments[0]?.Origin} → ${searchDto.Segments[0]?.Destination}`,
    );

    try {
      const response = await axios.post(CALENDAR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      const data = response.data;

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Calendar Fare returned error', tboError);

        if (tboError?.ErrorCode === 25) {
          this.logger.warn('⚠️ TBO Calendar Fare: No fares found (ErrorCode 25)');
          return data;
        }

        throw new HttpException(
          tboError?.ErrorMessage || 'Calendar fare fetch failed',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid in Calendar Fare. Retry...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getCalendarFare(searchDto, endUserIp);
      }

      this.logger.error('❌ TBO Calendar Fare API error', error?.message);
      throw new HttpException('Failed to fetch calendar fares from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 4: Update Calendar Fare of Day ────────────────────────────────────
  // Per TBO docs: POST to AirService.svc/rest/UpdateCalendarFareOfDay
  // Triggers live check & forces cache update of cheapest fare for a specific day.
  // ────────────────────────────────────────────────────────────────────────────
  async updateCalendarFareOfDay(searchDto: FlightSearchDto, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      JourneyType: searchDto.JourneyType || 1,
      PreferredAirlines: searchDto.PreferredAirlines ?? null,
      Segments: searchDto.Segments.map(seg => ({
        Origin: seg.Origin,
        Destination: seg.Destination,
        FlightCabinClass: seg.FlightCabinClass || 2,
        PreferredDepartureTime: seg.PreferredDepartureTime,
      })),
      Sources: searchDto.Sources ?? null,
    };

    const UPDATE_CALENDAR_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/UpdateCalendarFareOfDay';

    this.logger.log(
      `📅 TBO Update Calendar Fare of Day: ${searchDto.Segments[0]?.Origin} → ${searchDto.Segments[0]?.Destination} on ${searchDto.Segments[0]?.PreferredDepartureTime}`,
    );

    try {
      const response = await axios.post(UPDATE_CALENDAR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Update Calendar Fare of Day returned error', tboError);

        if (tboError?.ErrorCode === 25) {
          this.logger.warn('⚠️ TBO Update Calendar Fare: No fares found (ErrorCode 25)');
          return data;
        }

        throw new HttpException(
          tboError?.ErrorMessage || 'Update calendar fare fetch failed',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid in Update Calendar Fare. Retry...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.updateCalendarFareOfDay(searchDto, endUserIp);
      }

      this.logger.error('❌ TBO Update Calendar Fare API error', error?.message);
      throw new HttpException('Failed to update calendar fares from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }
}

