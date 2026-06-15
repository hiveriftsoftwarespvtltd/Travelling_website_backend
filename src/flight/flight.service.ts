import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { FlightSearchDto } from './dto/flight-search.dto';
import { FlightBooking } from './schemas/flight-booking.schema';
import { Cancellation } from './schemas/cancellation.schema';

// ─── TBO API Endpoints (from TBO Documentation) ────────────────────────────
const AUTH_URL = 'http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate';
const SEARCH_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/Search';
const FARE_UPSELL_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/FareUpsell';
const FARE_RULE_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/FareRule';
const FARE_QUOTE_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/FareQuote';
const SSR_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/SSR';
const BOOK_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/Book';
const TICKET_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/Ticket';
const GET_BOOKING_DETAILS_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/GetBookingDetails';
const RELEASE_PNR_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/ReleasePNRRequest';
const SEND_CHANGE_REQUEST_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/SendChangeRequest';
const GET_CHANGE_REQUEST_STATUS_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/GetChangeRequestStatus';
const GET_CANCELLATION_CHARGES_URL = 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/GetCancellationCharges';

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

  constructor(
    @InjectModel(FlightBooking.name) private flightBookingModel: Model<FlightBooking>,
    @InjectModel(Cancellation.name) private cancellationModel: Model<Cancellation>,
  ) {}

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
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.searchFlights(searchDto, endUserIp);
        }

        // ErrorCode 25 is "No result found". Return the response data with a successful response
        // so the frontend can handle it nicely rather than getting a 502 Bad Gateway error.
        if (tboError?.ErrorCode === 25 || tboError?.ErrorCode === 2) {
          this.logger.warn(`⚠️ TBO Search: No flights found (ErrorCode ${tboError?.ErrorCode})`);
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
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getCalendarFare(searchDto, endUserIp);
        }

        if (tboError?.ErrorCode === 25 || tboError?.ErrorCode === 2) {
          this.logger.warn(`⚠️ TBO Calendar Fare: No fares found (ErrorCode ${tboError?.ErrorCode})`);
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
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.updateCalendarFareOfDay(searchDto, endUserIp);
        }

        if (tboError?.ErrorCode === 25 || tboError?.ErrorCode === 2) {
          this.logger.warn(`⚠️ TBO Update Calendar Fare: No fares found (ErrorCode ${tboError?.ErrorCode})`);
          return data;
        }

        this.logger.warn(`⚠️ TBO Update Calendar Fare returned non-critical error (ErrorCode ${tboError?.ErrorCode}). Returning empty results.`);
        return { Response: { SearchResults: [] } };
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

      this.logger.warn('⚠️ TBO Update Calendar Fare API error, returning empty results to avoid frontend crash: ' + error?.message);
      return { Response: { SearchResults: [] } };
    }
  }
  // ─── Step 6: Fare Upsell (Branded Fares) ──────────────────────────────────
  async getFareUpsell(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      TraceId: reqBody.TraceId,
      ResultIndex: reqBody.ResultIndex,
    };

    this.logger.log(`📈 TBO Fare Upsell Request for ResultIndex: ${reqBody.ResultIndex}`);

    try {
      const response = await axios.post(FARE_UPSELL_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        // Just return it nicely so frontend handles "no upsell options"
        this.logger.warn(`⚠️ TBO Fare Upsell no results or error (ErrorCode ${tboError?.ErrorCode})`);
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getFareUpsell(reqBody, endUserIp);
        }
        return data;
      }

      this.logger.log(`✅ TBO Fare Upsell success! TraceId: ${data?.Response?.TraceId}`);
      try {
        require('fs').writeFileSync('test/fare-upsell-debug.json', JSON.stringify(data, null, 2));
      } catch (e) {
        this.logger.error('Failed to write debug JSON', e);
      }
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Fare Upsell. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getFareUpsell(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO Fare Upsell API error', error?.message);
      throw new HttpException('Failed to fetch fare upsell options from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }
  // ─── Step 7: Fare Rules (Cancellation / Date Change) ──────────────────────
  async getFareRule(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      TraceId: reqBody.TraceId,
      ResultIndex: reqBody.ResultIndex,
    };

    this.logger.log(`📜 TBO Fare Rule Request for ResultIndex: ${reqBody.ResultIndex}`);

    try {
      const response = await axios.post(FARE_RULE_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.warn(`⚠️ TBO Fare Rule no results or error (ErrorCode ${tboError?.ErrorCode})`);
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getFareRule(reqBody, endUserIp);
        }
        return data;
      }

      this.logger.log(`✅ TBO Fare Rule success! TraceId: ${data?.Response?.TraceId}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Fare Rule. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getFareRule(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO Fare Rule API error', error?.message);
      throw new HttpException('Failed to fetch fare rules from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }
  // ─── Step 8: Fare Quote (Re-validation) ───────────────────────────────────
  async getFareQuote(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      TraceId: reqBody.TraceId,
      ResultIndex: reqBody.ResultIndex,
    };

    this.logger.log(`🛡️ TBO Fare Quote Request for ResultIndex: ${reqBody.ResultIndex}`);

    try {
      const response = await axios.post(FARE_QUOTE_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(`❌ TBO Fare Quote Failed (ErrorCode ${tboError?.ErrorCode}): ${tboError?.ErrorMessage}`);
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getFareQuote(reqBody, endUserIp);
        }
        throw new HttpException(
          tboError?.ErrorMessage || 'Fare re-validation failed. Flight might be sold out.',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`✅ TBO Fare Quote success! IsPriceChanged: ${data?.Response?.IsPriceChanged}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Fare Quote. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getFareQuote(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO Fare Quote API error', error?.message);
      throw new HttpException('Failed to re-validate fare with TBO API', HttpStatus.BAD_GATEWAY);
    }
  }
  // ─── Step 9: SSR (Meals, Baggage, Seats) ────────────────────────────────
  async getSSR(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      TraceId: reqBody.TraceId,
      ResultIndex: reqBody.ResultIndex,
    };

    this.logger.log(`🍽️ TBO SSR Request for ResultIndex: ${reqBody.ResultIndex}`);

    try {
      const response = await axios.post(SSR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.warn(`⚠️ TBO SSR no results or error (ErrorCode ${tboError?.ErrorCode})`);
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getSSR(reqBody, endUserIp);
        }
        return data; // SSR is optional, we don't throw an error if it fails
      }

      this.logger.log(`✅ TBO SSR success! TraceId: ${data?.Response?.TraceId}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on SSR. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getSSR(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO SSR API error', error?.message);
      throw new HttpException('Failed to fetch SSR from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 10: Book Flight ────────────────────────────────────────────────
  async bookFlight(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ...reqBody,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(`🎫 TBO Book Request for TraceId: ${reqBody.TraceId}`);

    try {
      const response = await axios.post(BOOK_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000, // Booking can take a bit longer
      });

      const data = response.data;
      console.log("\n================ TBO BOOK REQUEST PAYLOAD ================\n", JSON.stringify(payload, null, 2));
      console.log("\n================ TBO BOOK RESPONSE ================\n", JSON.stringify(data, null, 2));
      
      try {
        require('fs').writeFileSync('test/book_req.json', JSON.stringify(payload, null, 2));
        require('fs').writeFileSync('test/book_res.json', JSON.stringify(data, null, 2));
      } catch(e) {}

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Book returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.bookFlight(reqBody, endUserIp);
        }

        throw new HttpException(
          { message: tboError?.ErrorMessage || 'Booking failed at airline/TBO level', details: tboError },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Book success! PNR: ${data?.Response?.Response?.PNR}`);
      
      try {
        const responseData = data?.Response?.Response;
        if (responseData && responseData.BookingId) {
          await this.flightBookingModel.findOneAndUpdate(
            { bookingId: String(responseData.BookingId) },
            {
              bookingId: String(responseData.BookingId),
              pnr: responseData.PNR || '',
              traceId: reqBody.TraceId || '',
              status: responseData.Status || 'Confirmed',
              passengers: responseData.FlightItinerary?.Passenger || [],
              flightDetails: responseData.FlightItinerary || {},
              fareDetails: responseData.FlightItinerary?.Fare || {},
              endUserIp: endUserIp,
            },
            { upsert: true, new: true }
          );
          this.logger.log(`💾 Saved/Updated FlightBooking in DB: ${responseData.BookingId}`);
        }
      } catch (dbError) {
        this.logger.error('❌ Failed to save booking to DB: ' + dbError.message);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Book. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.bookFlight(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Book API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to book flight with TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 11: Ticket Flight (LCC & Non-LCC) ──────────────────────────────
  async ticketFlight(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ...reqBody,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(`🎫 TBO Ticket Request for TraceId: ${reqBody.TraceId}`);

    try {
      const response = await axios.post(TICKET_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000, 
      });

      const data = response.data;
      console.log("\n================ TBO TICKET REQUEST PAYLOAD ================\n", JSON.stringify(payload, null, 2));
      console.log("\n================ TBO TICKET RESPONSE ================\n", JSON.stringify(data, null, 2));

      try {
        require('fs').writeFileSync('test/ticket_req.json', JSON.stringify(payload, null, 2));
        require('fs').writeFileSync('test/ticket_res.json', JSON.stringify(data, null, 2));
      } catch(e) {}

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Ticket returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.ticketFlight(reqBody, endUserIp);
        }

        throw new HttpException(
          { message: tboError?.ErrorMessage || 'Ticketing failed at airline/TBO level', details: tboError },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Ticket success! PNR: ${data?.Response?.Response?.PNR}`);
      
      try {
        const responseData = data?.Response?.Response;
        if (responseData && responseData.BookingId) {
          await this.flightBookingModel.findOneAndUpdate(
            { bookingId: String(responseData.BookingId) },
            {
              bookingId: String(responseData.BookingId),
              pnr: responseData.PNR || '',
              traceId: reqBody.TraceId || '',
              status: responseData.Status || 'Confirmed',
              passengers: responseData.FlightItinerary?.Passenger || [],
              flightDetails: responseData.FlightItinerary || {},
              fareDetails: responseData.FlightItinerary?.Fare || {},
              endUserIp: endUserIp,
            },
            { upsert: true, new: true }
          );
          this.logger.log(`💾 Saved/Updated FlightBooking in DB: ${responseData.BookingId}`);
        }
      } catch (dbError) {
        this.logger.error('❌ Failed to save booking to DB: ' + dbError.message);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Ticket. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.ticketFlight(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Ticket API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to ticket flight with TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 12: Get Booking Details ──────────────────────────────────────────
  async getBookingDetails(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload: any = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    if (reqBody.PNR) {
      payload.PNR = reqBody.PNR;
    }
    if (reqBody.BookingId) {
      payload.BookingId = reqBody.BookingId;
    }
    if (reqBody.FirstName) {
      payload.FirstName = reqBody.FirstName;
    }
    if (reqBody.LastName) {
      payload.LastName = reqBody.LastName;
    }
    if (reqBody.TraceId) {
      payload.TraceId = reqBody.TraceId;
    }

    this.logger.log(`🔍 TBO Get Booking Details Request | PNR: ${reqBody.PNR || 'N/A'}, BookingId: ${reqBody.BookingId || 'N/A'}, TraceId: ${reqBody.TraceId || 'N/A'}`);

    try {
      const response = await axios.post(GET_BOOKING_DETAILS_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Get Booking Details returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getBookingDetails(reqBody, endUserIp);
        }

        throw new HttpException(
          { message: tboError?.ErrorMessage || 'Failed to get booking details', details: tboError },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Get Booking Details success! PNR: ${data?.Response?.FlightItinerary?.PNR}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Get Booking Details. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getBookingDetails(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Get Booking Details API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to fetch booking details from TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }
  // ─── Step 13: Release PNR (Cancel Un-Ticketed Booking) ────────────────────
  async releasePNR(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      BookingId: reqBody.BookingId,
      Source: reqBody.Source,
    };

    this.logger.log(`🗑️ TBO Release PNR Request for BookingId: ${reqBody.BookingId}`);

    try {
      const response = await axios.post(RELEASE_PNR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      console.log("\n================ TBO RELEASE PNR REQUEST PAYLOAD ================\n", JSON.stringify(payload, null, 2));
      console.log("\n================ TBO RELEASE PNR RESPONSE ================\n", JSON.stringify(data, null, 2));

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Release PNR returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.releasePNR(reqBody, endUserIp);
        }
        throw new HttpException(
          {
            message: tboError?.ErrorMessage || 'TBO API rejected the Release PNR request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Release PNR success! BookingId: ${reqBody.BookingId}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Release PNR. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.releasePNR(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Release PNR API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to release PNR from TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }
  // ─── Step 14: Send Change Request (Modify/Cancel Ticketed Booking) ────────
  async sendChangeRequest(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload: any = {
      BookingId: reqBody.BookingId,
      RequestType: reqBody.RequestType,
      CancellationType: reqBody.CancellationType,
      Remarks: reqBody.Remarks || "Change request submitted via platform.",
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    if (reqBody.TicketId && Array.isArray(reqBody.TicketId) && reqBody.TicketId.length > 0) {
      payload.TicketId = reqBody.TicketId;
    }

    if (reqBody.Sectors && Array.isArray(reqBody.Sectors) && reqBody.Sectors.length > 0) {
      payload.Sectors = reqBody.Sectors;
    }

    this.logger.log(`🔄 TBO Send Change Request for BookingId: ${reqBody.BookingId}, RequestType: ${reqBody.RequestType}`);

    try {
      const response = await axios.post(SEND_CHANGE_REQUEST_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      console.log("\n================ TBO CHANGE REQUEST PAYLOAD ================\n", JSON.stringify(payload, null, 2));
      console.log("\n================ TBO CHANGE RESPONSE ================\n", JSON.stringify(data, null, 2));

      if (data?.Response?.ResponseStatus !== 1 && data?.Response?.ResponseStatus !== 4) { // Sometimes 4 is successful partial
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Send Change Request returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.sendChangeRequest(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message: tboError?.ErrorMessage || 'TBO API rejected the Change request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Send Change Request success! Ticket Change Requested for: ${reqBody.BookingId}`);

      try {
        const responseData = data?.Response;
        if (responseData && responseData.ChangeRequestId) {
          await this.cancellationModel.findOneAndUpdate(
            { changeRequestId: String(responseData.ChangeRequestId) },
            {
              changeRequestId: String(responseData.ChangeRequestId),
              bookingId: String(reqBody.BookingId),
              cancellationType: reqBody.RequestType === 1 || reqBody.RequestType === "1" ? 'FULL_CANCEL' : 'PARTIAL_CANCEL',
              status: 'Processing',
              endUserIp: endUserIp,
            },
            { upsert: true, new: true }
          );
          this.logger.log(`💾 Saved/Updated Cancellation in DB: ${responseData.ChangeRequestId}`);
        }
      } catch (dbError) {
        this.logger.error('❌ Failed to save cancellation to DB: ' + dbError.message);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Send Change Request. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.sendChangeRequest(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Send Change Request API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to send change request to TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 15: Get Change Request Status ───────────────────────────────────
  async getChangeRequestStatus(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ChangeRequestId: reqBody.ChangeRequestId,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(`🔍 TBO Get Change Request Status for ID: ${reqBody.ChangeRequestId}`);

    try {
      const response = await axios.post(GET_CHANGE_REQUEST_STATUS_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      console.log("\n================ TBO CHANGE STATUS PAYLOAD ================\n", JSON.stringify(payload, null, 2));
      console.log("\n================ TBO CHANGE STATUS RESPONSE ================\n", JSON.stringify(data, null, 2));

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Get Change Request Status returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getChangeRequestStatus(reqBody, endUserIp);
        }
        throw new HttpException(
          {
            message: tboError?.ErrorMessage || 'TBO API rejected the Status request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Get Change Request Status success! Request ID: ${reqBody.ChangeRequestId}`);

      try {
        const responseData = data?.Response;
        if (responseData && responseData.ChangeRequestId) {
          const statusText = responseData.ChangeRequestStatus === 1 ? 'Unassigned' :
                             responseData.ChangeRequestStatus === 2 ? 'Assigned' :
                             responseData.ChangeRequestStatus === 3 ? 'Acknowledged' :
                             responseData.ChangeRequestStatus === 4 ? 'Completed' :
                             responseData.ChangeRequestStatus === 5 ? 'Rejected' :
                             responseData.ChangeRequestStatus === 6 ? 'InProgress' : 'Pending';

          await this.cancellationModel.findOneAndUpdate(
            { changeRequestId: String(responseData.ChangeRequestId) },
            {
              status: statusText,
              refundAmount: responseData.RefundedAmount || 0,
              cancellationCharge: responseData.CancellationCharge || 0,
              refundDetails: responseData,
            },
            { new: true }
          );
          
          // If Completed, also mark the original booking as Cancelled
          if (statusText === 'Completed') {
            await this.flightBookingModel.findOneAndUpdate(
              { bookingId: String(responseData.BookingId) }, // Might not be returned here, but we can query by cancellation doc
              { status: 'Cancelled' }
            );
          }
        }
      } catch (dbError) {
        this.logger.error('❌ Failed to update cancellation in DB: ' + dbError.message);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Get Change Request Status. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getChangeRequestStatus(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Get Change Request Status API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to get change request status from TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Step 16: Get Cancellation Charges (Quote) ───────────────────────────
  async getCancellationCharges(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      BookingId: reqBody.BookingId,
      RequestType: reqBody.RequestType || "1",
      BookingMode: reqBody.BookingMode || "5",
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(`💵 TBO Get Cancellation Charges for BookingId: ${reqBody.BookingId}`);

    try {
      const response = await axios.post(GET_CANCELLATION_CHARGES_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      console.log("\n================ TBO CANCELLATION REQUEST PAYLOAD ================\n", JSON.stringify(payload, null, 2));
      console.log("\n================ TBO CANCELLATION RESPONSE ================\n", JSON.stringify(data, null, 2));

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Get Cancellation Charges returned error: ' + JSON.stringify(tboError));
        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getCancellationCharges(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message: tboError?.ErrorMessage || 'TBO API rejected the Cancellation Charges request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(`✅ TBO Get Cancellation Charges success! BookingId: ${reqBody.BookingId}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (tboErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboErrorCode === TBO_ERROR_INVALID_TOKEN) {
        this.logger.warn('⚠️ TBO token expired/invalid on Get Cancellation Charges. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getCancellationCharges(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Get Cancellation Charges API error details: ' + JSON.stringify(responseData));
      
      throw new HttpException({
        message: 'Failed to get cancellation charges from TBO API',
        details: responseData
      }, HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── DB Fetch Methods ───────────────────────────────────────────
  
  async getMyBookings(reqBody: any, endUserIp: string) {
    try {
      // In a real app, query by userId. For testing, just return all sorted by newest.
      const bookings = await this.flightBookingModel.find().sort({ createdAt: -1 }).exec();
      return { success: true, data: bookings };
    } catch (e) {
      throw new HttpException({ message: 'Failed to fetch bookings', details: e.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getMyCancellations(reqBody: any, endUserIp: string) {
    try {
      const cancellations = await this.cancellationModel.find().sort({ createdAt: -1 }).exec();
      return { success: true, data: cancellations };
    } catch (e) {
      throw new HttpException({ message: 'Failed to fetch cancellations', details: e.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getCancellationByBooking(reqBody: any, endUserIp: string) {
    try {
      if (!reqBody.BookingId) {
        throw new Error('BookingId is required');
      }
      // Get the most recent cancellation request for this booking
      const cancellation = await this.cancellationModel.findOne({ bookingId: String(reqBody.BookingId) }).sort({ createdAt: -1 }).exec();
      
      if (!cancellation) {
         return { success: true, data: null };
      }

      // If it's pending/processing, try to fetch the latest status from TBO
      if (cancellation.status === 'Pending' || cancellation.status === 'Processing') {
         try {
           const statusRes = await this.getChangeRequestStatus({ ChangeRequestId: cancellation.changeRequestId }, endUserIp);
           // getChangeRequestStatus already updates the DB internally
           // Refetch after update
           const updated = await this.cancellationModel.findOne({ changeRequestId: cancellation.changeRequestId }).exec();
           return { success: true, data: updated };
         } catch(err) {
           this.logger.error('Failed to sync cancellation status with TBO: ' + err.message);
         }
      }

      return { success: true, data: cancellation };
    } catch (e) {
      throw new HttpException({ message: 'Failed to fetch cancellation by booking', details: e.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
