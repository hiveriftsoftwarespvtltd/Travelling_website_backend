import { Injectable, HttpException, HttpStatus, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { FlightSearchDto } from './dto/flight-search.dto';
import { FlightBooking } from './schemas/flight-booking.schema';
import { Cancellation } from './schemas/cancellation.schema';
import { SettingsService } from '../settings/settings.service';
import { FlightPricingService } from '../flight-pricing/flight-pricing.service';
import { MarketType } from '../flight-pricing/schemas/flight-pricing-rule.schema';

// ─── High-Performance Persistent Connection Pool ──────────────────
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 30,
  keepAliveMsecs: 60000,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 30,
  keepAliveMsecs: 60000,
});

const tboClient = axios.create({
  httpAgent,
  httpsAgent,
  headers: {
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  },
  timeout: 45000,
});

// ─── TBO API Endpoints & Credentials ──────────────────────────────
const TBO = {
  get AUTH_URL() {
    return `${process.env.TBO_AUTH_BASE_URL || 'http://Sharedapi.tektravels.com/SharedData.svc/rest'}/Authenticate`;
  },
  get SEARCH_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/Search`;
  },
  get FARE_UPSELL_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/FareUpsell`;
  },
  get FARE_RULE_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/FareRule`;
  },
  get FARE_QUOTE_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/FareQuote`;
  },
  get SSR_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/SSR`;
  },
  get BOOK_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/Book`;
  },
  get TICKET_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/Ticket`;
  },
  get GET_BOOKING_DETAILS_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/GetBookingDetails`;
  },
  get RELEASE_PNR_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/ReleasePNRRequest`;
  },
  get SEND_CHANGE_REQUEST_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/SendChangeRequest`;
  },
  get GET_CHANGE_REQUEST_STATUS_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/GetChangeRequestStatus`;
  },
  get GET_CANCELLATION_CHARGES_URL() {
    return `${process.env.TBO_AIR_BOOK_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/GetCancellationCharges`;
  },
  get CALENDAR_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/GetCalendarFare`;
  },
  get UPDATE_CALENDAR_URL() {
    return `${process.env.TBO_AIR_SEARCH_BASE_URL || 'http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest'}/UpdateCalendarFareOfDay`;
  },
  get AUTH_CREDENTIALS() {
    return {
      ClientId: process.env.TBO_CLIENT_ID || 'ApiIntegrationNew',
      UserName: process.env.TBO_USERNAME || 'Lifejiyo',
      Password: process.env.TBO_PASSWORD || 'Lifejiyo@123',
    };
  },
};

// ─── TBO Error Codes ────────────────────────────────────────────────────────
const TBO_ERROR_TOKEN_EXPIRED = 6;
const TBO_ERROR_INVALID_TOKEN = 7;

@Injectable()
export class FlightService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlightService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private flightBookingModel: Model<FlightBooking>,
    @InjectModel(Cancellation.name)
    private cancellationModel: Model<Cancellation>,
    private readonly settingsService: SettingsService,
    private readonly flightPricingService: FlightPricingService,
  ) {}

  /**
   * Helper: Checks if a flight itinerary is domestic (all segments have origin & destination in IN).
   */
  private isDomesticFlight(itinerary: any): boolean {
    try {
      const segments = itinerary?.Segments;
      if (!segments || !Array.isArray(segments) || segments.length === 0) return true;

      for (const segGroup of segments) {
        if (!Array.isArray(segGroup)) continue;
        for (const leg of segGroup) {
          const orig = leg?.Origin?.Airport?.CountryCode;
          const dest = leg?.Destination?.Airport?.CountryCode;
          if (orig && orig !== 'IN') return false;
          if (dest && dest !== 'IN') return false;
        }
      }
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Helper: Applies agency markup to an individual itinerary using the centralized pricing engine.
   * Preserves supplierFare, calculates slab-based markup, clamps min/max, and formats customer fare.
   */
  private async applyMarkupToItinerary(
    itinerary: any,
    defaultPaxCount: number = 1,
  ) {
    if (!itinerary || !itinerary.Fare) return;

    let totalPax = defaultPaxCount;
    if (
      Array.isArray(itinerary.FareBreakdown) &&
      itinerary.FareBreakdown.length > 0
    ) {
      const count = itinerary.FareBreakdown.reduce(
        (acc: number, fb: any) => acc + (Number(fb.PassengerCount) || 0),
        0,
      );
      if (count > 0) totalPax = count;
    }

    const isDomestic = this.isDomesticFlight(itinerary);
    const market = isDomestic ? MarketType.DOMESTIC : MarketType.INTERNATIONAL;
    const rawSupplierFare = Number(
      itinerary.Fare.SupplierFare ||
        itinerary.Fare.PublishedFare ||
        itinerary.Fare.OfferedFare ||
        itinerary.Fare.BaseFare ||
        0,
    );

    const pricing = await this.flightPricingService.calculateFlightPrice(
      rawSupplierFare,
      market,
      { paxCount: totalPax },
    );

    itinerary.Fare.SupplierFare = rawSupplierFare;
    itinerary.Fare.SupplierBaseFare = itinerary.Fare.BaseFare;
    itinerary.Fare.AgencyMarkup = pricing.markupAmount;
    itinerary.Fare.MarkupPercentage = pricing.markupPercentage;
    itinerary.Fare.PricingRuleId = pricing.pricingRuleId;
    itinerary.Fare.IsDomestic = isDomestic;
    itinerary.Fare.MarketType = market;
    itinerary.Fare.FinalCustomerFare = pricing.finalCustomerFare;

    if (pricing.markupAmount > 0) {
      itinerary.Fare.PublishedFare = pricing.finalCustomerFare;
      itinerary.Fare.OfferedFare = pricing.finalCustomerFare;
      if (typeof itinerary.Fare.BaseFare === 'number') {
        itinerary.Fare.BaseFare = Math.round(itinerary.Fare.BaseFare + pricing.markupAmount);
      }

      if (
        Array.isArray(itinerary.FareBreakdown) &&
        itinerary.FareBreakdown.length > 0
      ) {
        const payingBreakdowns = itinerary.FareBreakdown.filter(
          (fb: any) => fb.PassengerType === 1 || fb.PassengerType === 2,
        );
        const totalPaying =
          payingBreakdowns.reduce(
            (sum: number, fb: any) => sum + (Number(fb.PassengerCount) || 1),
            0,
          ) || 1;
        const markupPerPax = Math.round(pricing.markupAmount / totalPaying);

        for (const fb of payingBreakdowns) {
          const count = Number(fb.PassengerCount) || 1;
          const fbMarkup = markupPerPax * count;
          fb.BaseFare = Math.round((fb.BaseFare || 0) + fbMarkup);
          fb.AgencyMarkup = markupPerPax;
        }
      }
    }
  }

  /**
   * Helper: Iterates over 1D or 2D array of itineraries and applies markup to each.
   */
  private async applyMarkupToResults(
    data: any,
    defaultPaxCount: number = 1,
  ) {
    if (!data?.Response?.Results) return;
    const results = data.Response.Results;

    if (Array.isArray(results)) {
      for (const item of results) {
        if (Array.isArray(item)) {
          for (const itin of item) {
            await this.applyMarkupToItinerary(itin, defaultPaxCount);
          }
        } else if (item && typeof item === 'object') {
          await this.applyMarkupToItinerary(item, defaultPaxCount);
        }
      }
    }
  }

  // In-memory token cache — valid for 3 hours (TBO tokens last longer but 3h is safe)
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  // In-memory flight search cache — 2-tier Stale-While-Revalidate (SWR)
  // freshUntil: 15 minutes (immediate return)
  // staleUntil: 2 hours (immediate return + background revalidation)
  private flightSearchCache = new Map<
    string,
    { data: any; freshUntil: number; staleUntil: number }
  >();

  // In-flight request deduplication — if the same search is already in progress,
  // share the same Promise instead of firing a duplicate TBO API call.
  private flightSearchInFlight = new Map<string, Promise<any>>();

  // In-memory calendar fare cache — valid for 15 minutes (900s)
  private calendarFareCache = new Map<string, { data: any; expiry: number }>();

  async onApplicationBootstrap() {
    // Delay pre-warming 4 seconds after boot to let all NestJS providers start
    setTimeout(() => {
      this.prewarmTopRoutes().catch((err) =>
        this.logger.warn(`⚠️ Initial route pre-warming notice: ${err?.message}`),
      );
    }, 4000);

    // Periodic pre-warming every 25 minutes to keep top domestic routes primed
    setInterval(() => {
      this.prewarmTopRoutes().catch((err) =>
        this.logger.warn(`⚠️ Periodic route pre-warming notice: ${err?.message}`),
      );
    }, 25 * 60 * 1000);
  }

  /**
   * Pre-warms the top most searched domestic flight sectors into memory
   */
  private async prewarmTopRoutes() {
    this.logger.log('🔥 [PRE-WARM] Pre-warming popular flight sectors in background...');
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const depTime = d.toISOString().split('T')[0] + 'T00:00:00';

    const popularRoutes = [
      { Origin: 'DEL', Destination: 'BOM' },
      { Origin: 'BOM', Destination: 'DEL' },
      { Origin: 'DEL', Destination: 'BLR' },
    ];

    for (const route of popularRoutes) {
      try {
        const dto: FlightSearchDto = {
          JourneyType: 1,
          AdultCount: 1,
          ChildCount: 0,
          InfantCount: 0,
          DirectFlight: false,
          OneStopFlight: false,
          PreferredAirlines: null,
          Sources: null,
          Segments: [
            {
              Origin: route.Origin,
              Destination: route.Destination,
              FlightCabinClass: 1,
              PreferredDepartureTime: depTime,
              PreferredArrivalTime: depTime,
            },
          ],
        };
        const segKey = `${route.Origin}-${route.Destination}-${depTime.slice(0, 10)}-1`;
        const cacheKey = `1:1:0:0:0:0:${segKey}`;
        const cached = this.flightSearchCache.get(cacheKey);
        if (!cached || Date.now() > cached.freshUntil) {
          this.logger.log(`🔥 Pre-warming route: ${route.Origin} → ${route.Destination} (${depTime.slice(0, 10)})`);
          await this.executeTboSearch(dto, '127.0.0.1', cacheKey);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (e: any) {
        this.logger.warn(`⚠️ Route pre-warming skipped for ${route.Origin}-${route.Destination}: ${e?.message}`);
      }
    }
    this.logger.log('🔥 [PRE-WARM] Popular route pre-warming pass complete.');
  }

  // ─── Step 1: Get Authentication Token ──────────────────────────────────────
  // Per TBO docs: POST to SharedData.svc/rest/Authenticate
  // The EndUserIp MUST be the real end user's IP (not server IP)
  // ───────────────────────────────────────────────────────────────────────────
  private async getToken(endUserIp: string): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      this.logger.log(
        `✅ Using cached TBO token (expires in ${Math.round((this.tokenExpiry - now) / 60000)} min)`,
      );
      return this.cachedToken;
    }

    this.logger.log(`🔐 Fetching new TBO auth token for IP: ${endUserIp}`);
    this.logger.log(
      `🔑 Using TBO Credentials: ClientId=${TBO.AUTH_CREDENTIALS.ClientId}, UserName=${TBO.AUTH_CREDENTIALS.UserName}`,
    );
    try {
      const response = await tboClient.post(
        TBO.AUTH_URL,
        {
          ...TBO.AUTH_CREDENTIALS,
          EndUserIp: endUserIp, // Real user IP from request
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

      this.logger.log(
        `✅ TBO Token obtained. Agent: ${data.Member?.FirstName} ${data.Member?.LastName}`,
      );
      return this.cachedToken as string;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Auth API error', error?.message);
      throw new HttpException(
        'Failed to authenticate with TBO flight API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Step 2: Search Flights (with 2-Tier SWR Caching & Socket Pool) ─────────
  // Per TBO docs: POST to AirService.svc/rest/Search
  // JourneyType: 1=OneWay, 2=Return, 3=MultiCity
  // FlightCabinClass: 1=All, 2=Economy, 3=PremiumEconomy, 4=Business, 5=PremiumBusiness, 6=First
  // ───────────────────────────────────────────────────────────────────────────
  async searchFlights(searchDto: FlightSearchDto, endUserIp: string) {
    const segKey = (searchDto.Segments || [])
      .map(
        (s) =>
          `${s.Origin}-${s.Destination}-${(s.PreferredDepartureTime || '').slice(0, 10)}-${s.FlightCabinClass || 1}`,
      )
      .join('|');
    const searchCacheKey = `${searchDto.JourneyType || 1}:${searchDto.AdultCount || 1}:${searchDto.ChildCount || 0}:${searchDto.InfantCount || 0}:${searchDto.DirectFlight ? 1 : 0}:${searchDto.OneStopFlight ? 1 : 0}:${segKey}`;

    const now = Date.now();
    const cachedSearch = this.flightSearchCache.get(searchCacheKey);

    // 1. FRESH HIT (< 15 mins): return immediately (approx 5-15ms)
    if (cachedSearch && now < cachedSearch.freshUntil) {
      const flightCount = cachedSearch.data?.Response?.Results?.[0]?.length ?? 0;
      this.logger.log(
        `⚡ [CACHE HIT - FRESH] Flight Search: ${searchDto.Segments?.[0]?.Origin} → ${searchDto.Segments?.[0]?.Destination} (${flightCount} flights)`,
      );
      const paxCount = (searchDto.AdultCount || 1) + (searchDto.ChildCount || 0);
      const cloned = JSON.parse(JSON.stringify(cachedSearch.data));
      await this.applyMarkupToResults(cloned, paxCount);
      return cloned;
    }

    // 2. STALE HIT (< 2 hours): return immediately and revalidate in background (SWR pattern)
    if (cachedSearch && now < cachedSearch.staleUntil) {
      const flightCount = cachedSearch.data?.Response?.Results?.[0]?.length ?? 0;
      this.logger.log(
        `⚡ [CACHE HIT - STALE/SWR] Flight Search: ${searchDto.Segments?.[0]?.Origin} → ${searchDto.Segments?.[0]?.Destination} (${flightCount} flights). Revalidating in background...`,
      );
      // Background revalidation
      this.revalidateSearchInBackground(searchDto, endUserIp, searchCacheKey);

      const paxCount = (searchDto.AdultCount || 1) + (searchDto.ChildCount || 0);
      const cloned = JSON.parse(JSON.stringify(cachedSearch.data));
      await this.applyMarkupToResults(cloned, paxCount);
      return cloned;
    }

    // 3. Deduplication: if the exact same search is already in flight, share the promise
    const existingInflight = this.flightSearchInFlight.get(searchCacheKey);
    if (existingInflight) {
      this.logger.log(
        `🔄 [DEDUP] Flight Search already in flight: ${searchDto.Segments?.[0]?.Origin} → ${searchDto.Segments?.[0]?.Destination}. Sharing promise.`,
      );
      const data = await existingInflight;
      const paxCount = (searchDto.AdultCount || 1) + (searchDto.ChildCount || 0);
      const cloned = JSON.parse(JSON.stringify(data));
      await this.applyMarkupToResults(cloned, paxCount);
      return cloned;
    }

    // 4. Cold execution: fetch from TBO using pooled keep-alive socket + gzip
    const data = await this.executeTboSearch(searchDto, endUserIp, searchCacheKey);
    const paxCount = (searchDto.AdultCount || 1) + (searchDto.ChildCount || 0);
    const responseData = JSON.parse(JSON.stringify(data));
    await this.applyMarkupToResults(responseData, paxCount);
    return responseData;
  }

  /**
   * Asynchronous background revalidation for Stale-While-Revalidate pattern
   */
  private revalidateSearchInBackground(
    searchDto: FlightSearchDto,
    endUserIp: string,
    searchCacheKey: string,
  ) {
    if (this.flightSearchInFlight.has(searchCacheKey)) return;
    this.executeTboSearch(searchDto, endUserIp, searchCacheKey)
      .then((data) => {
        const count = data?.Response?.Results?.[0]?.length ?? 0;
        this.logger.log(`✅ [SWR REVALIDATED] Cache refreshed: ${count} flights for ${searchCacheKey.slice(0, 40)}`);
      })
      .catch((err) => {
        this.logger.warn(`⚠️ [SWR REVALIDATE NOTICE] ${err?.message}`);
      });
  }

  /**
   * Executes the raw TBO Search API call with connection pooling, deduplication and error handling
   */
  private async executeTboSearch(
    searchDto: FlightSearchDto,
    endUserIp: string,
    searchCacheKey: string,
  ): Promise<any> {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      AdultCount: searchDto.AdultCount,
      ChildCount: searchDto.ChildCount,
      InfantCount: searchDto.InfantCount,
      DirectFlight: searchDto.DirectFlight,
      OneStopFlight: searchDto.OneStopFlight,
      JourneyType: searchDto.JourneyType,
      PreferredAirlines: searchDto.PreferredAirlines ?? null,
      Segments: searchDto.Segments,
      Sources: searchDto.Sources ?? null,
    };

    this.logger.log(
      `🔍 TBO Flight Search: ${searchDto.Segments?.[0]?.Origin} → ${searchDto.Segments?.[0]?.Destination} | JourneyType: ${searchDto.JourneyType}`,
    );

    const tboSearchPromise = tboClient
      .post(TBO.SEARCH_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      })
      .then((r) => r.data);

    this.flightSearchInFlight.set(searchCacheKey, tboSearchPromise);

    try {
      const data = await tboSearchPromise;

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Search returned error', tboError);
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.executeTboSearch(searchDto, endUserIp, searchCacheKey);
        }

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
      this.logger.log(
        `✅ TBO Search success! Found ${flightCount} flights. TraceId: ${data?.Response?.TraceId}`,
      );

      // Save in cache: 15 minutes fresh, 2 hours stale
      const now = Date.now();
      this.flightSearchCache.set(searchCacheKey, {
        data,
        freshUntil: now + 15 * 60 * 1000,
        staleUntil: now + 120 * 60 * 1000,
      });

      // Prune expired entries if cache is growing large
      if (this.flightSearchCache.size > 300) {
        for (const [k, v] of this.flightSearchCache.entries()) {
          if (now > v.staleUntil) this.flightSearchCache.delete(k);
        }
      }

      return data;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.executeTboSearch(searchDto, endUserIp, searchCacheKey);
      }

      this.logger.error('❌ TBO Search API error: ' + error?.message);
      let errorDetail = 'Unknown Error';
      if (error?.response?.data) {
        errorDetail = JSON.stringify(error?.response?.data);
      } else {
        errorDetail = error?.message || 'Network Error / Timeout';
      }

      throw new HttpException(
        `Failed to fetch flights from TBO API. Details: ${errorDetail}`,
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      this.flightSearchInFlight.delete(searchCacheKey);
    }
  }

  // ─── Step 3: Get Calendar Fares ─────────────────────────────────────────────
  // Per TBO docs: POST to AirService.svc/rest/GetCalendarFare
  // Returns lowest fares for a specific route across multiple departure dates.
  // ───────────────────────────────────────────────────────────────────────────
  async getCalendarFare(searchDto: FlightSearchDto, endUserIp: string) {
    // 1. Check in-memory calendar fare cache (TTL: 10 minutes)
    const calSegKey = (searchDto.Segments || [])
      .map(
        (s) =>
          `${s.Origin}-${s.Destination}-${(s.PreferredDepartureTime || '').slice(0, 7)}-${s.FlightCabinClass || 2}`,
      )
      .join('|');
    const calCacheKey = `${searchDto.JourneyType || 1}:${calSegKey}`;

    const cachedCal = this.calendarFareCache.get(calCacheKey);
    if (cachedCal && Date.now() < cachedCal.expiry) {
      this.logger.log(
        `⚡ [CACHE HIT] Calendar Fare: ${searchDto.Segments?.[0]?.Origin} → ${searchDto.Segments?.[0]?.Destination}`,
      );
      return cachedCal.data;
    }

    const tokenId = await this.getToken(endUserIp);

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      JourneyType: searchDto.JourneyType || 1,
      PreferredAirlines: searchDto.PreferredAirlines ?? null,
      Segments: searchDto.Segments.map((seg) => ({
        Origin: seg.Origin,
        Destination: seg.Destination,
        FlightCabinClass: seg.FlightCabinClass || 2,
        PreferredDepartureTime: seg.PreferredDepartureTime,
      })),
      Sources: searchDto.Sources ?? null,
    };

    this.logger.log(
      `📅 TBO Calendar Fare Search: ${searchDto.Segments[0]?.Origin} → ${searchDto.Segments[0]?.Destination}`,
    );

    try {
      const response = await tboClient.post(TBO.CALENDAR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      const data = response.data;

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error('❌ TBO Calendar Fare returned error', tboError);
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getCalendarFare(searchDto, endUserIp);
        }

        if (tboError?.ErrorCode === 25 || tboError?.ErrorCode === 2) {
          this.logger.warn(
            `⚠️ TBO Calendar Fare: No fares found (ErrorCode ${tboError?.ErrorCode})`,
          );
          return data;
        }

        throw new HttpException(
          tboError?.ErrorMessage || 'Calendar fare fetch failed',
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Save in cache for 10 minutes (600s)
      this.calendarFareCache.set(calCacheKey, {
        data,
        expiry: Date.now() + 600 * 1000,
      });

      // Prune expired entries if cache is growing
      if (this.calendarFareCache.size > 200) {
        const now = Date.now();
        for (const [k, v] of this.calendarFareCache.entries()) {
          if (now > v.expiry) this.calendarFareCache.delete(k);
        }
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid in Calendar Fare. Retry...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getCalendarFare(searchDto, endUserIp);
      }

      this.logger.error('❌ TBO Calendar Fare API error', error?.message);
      throw new HttpException(
        'Failed to fetch calendar fares from TBO API',
        HttpStatus.BAD_GATEWAY,
      );
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
      Segments: searchDto.Segments.map((seg) => ({
        Origin: seg.Origin,
        Destination: seg.Destination,
        FlightCabinClass: seg.FlightCabinClass || 2,
        PreferredDepartureTime: seg.PreferredDepartureTime,
      })),
      Sources: searchDto.Sources ?? null,
    };

    this.logger.log(
      `📅 TBO Update Calendar Fare of Day: ${searchDto.Segments[0]?.Origin} → ${searchDto.Segments[0]?.Destination} on ${searchDto.Segments[0]?.PreferredDepartureTime}`,
    );

    try {
      const response = await tboClient.post(TBO.UPDATE_CALENDAR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Update Calendar Fare of Day returned error',
          tboError,
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.updateCalendarFareOfDay(searchDto, endUserIp);
        }

        if (tboError?.ErrorCode === 25 || tboError?.ErrorCode === 2) {
          this.logger.warn(
            `⚠️ TBO Update Calendar Fare: No fares found (ErrorCode ${tboError?.ErrorCode})`,
          );
          return data;
        }

        this.logger.warn(
          `⚠️ TBO Update Calendar Fare returned non-critical error (ErrorCode ${tboError?.ErrorCode}). Returning empty results.`,
        );
        return { Response: { SearchResults: [] } };
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid in Update Calendar Fare. Retry...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.updateCalendarFareOfDay(searchDto, endUserIp);
      }

      this.logger.warn(
        '⚠️ TBO Update Calendar Fare API error, returning empty results to avoid frontend crash: ' +
          error?.message,
      );
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

    this.logger.log(
      `📈 TBO Fare Upsell Request for ResultIndex: ${reqBody.ResultIndex}`,
    );

    try {
      const response = await tboClient.post(TBO.FARE_UPSELL_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        // Just return it nicely so frontend handles "no upsell options"
        this.logger.warn(
          `⚠️ TBO Fare Upsell no results or error (ErrorCode ${tboError?.ErrorCode})`,
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getFareUpsell(reqBody, endUserIp);
        }
        return data;
      }

      this.logger.log(
        `✅ TBO Fare Upsell success! TraceId: ${data?.Response?.TraceId}`,
      );
      try {
        require('fs').writeFileSync(
          'test/fare-upsell-debug.json',
          JSON.stringify(data, null, 2),
        );
      } catch (e) {
        this.logger.error('Failed to write debug JSON', e);
      }
      await this.applyMarkupToResults(data);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Fare Upsell. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getFareUpsell(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO Fare Upsell API error', error?.message);
      throw new HttpException(
        'Failed to fetch fare upsell options from TBO API',
        HttpStatus.BAD_GATEWAY,
      );
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

    this.logger.log(
      `📜 TBO Fare Rule Request for ResultIndex: ${reqBody.ResultIndex}`,
    );

    try {
      const response = await tboClient.post(TBO.FARE_RULE_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.warn(
          `⚠️ TBO Fare Rule no results or error (ErrorCode ${tboError?.ErrorCode})`,
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getFareRule(reqBody, endUserIp);
        }
        return data;
      }

      this.logger.log(
        `✅ TBO Fare Rule success! TraceId: ${data?.Response?.TraceId}`,
      );
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Fare Rule. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getFareRule(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO Fare Rule API error', error?.message);
      throw new HttpException(
        'Failed to fetch fare rules from TBO API',
        HttpStatus.BAD_GATEWAY,
      );
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

    this.logger.log(
      `🛡️ TBO Fare Quote Request for ResultIndex: ${reqBody.ResultIndex}`,
    );

    try {
      const response = await tboClient.post(TBO.FARE_QUOTE_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          `❌ TBO Fare Quote Failed (ErrorCode ${tboError?.ErrorCode}): ${tboError?.ErrorMessage}`,
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getFareQuote(reqBody, endUserIp);
        }
        throw new HttpException(
          tboError?.ErrorMessage ||
            'Fare re-validation failed. Flight might be sold out.',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `✅ TBO Fare Quote success! IsPriceChanged: ${data?.Response?.IsPriceChanged}`,
      );
      if (data?.Response?.Results) {
        await this.applyMarkupToItinerary(data.Response.Results);
      }
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Fare Quote. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getFareQuote(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO Fare Quote API error', error?.message);
      throw new HttpException(
        'Failed to re-validate fare with TBO API',
        HttpStatus.BAD_GATEWAY,
      );
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

    this.logger.log(
      `🍽️ TBO SSR Request for ResultIndex: ${reqBody.ResultIndex}`,
    );

    try {
      const response = await tboClient.post(TBO.SSR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.warn(
          `⚠️ TBO SSR no results or error (ErrorCode ${tboError?.ErrorCode})`,
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getSSR(reqBody, endUserIp);
        }
        return data; // SSR is optional, we don't throw an error if it fails
      }

      this.logger.log(
        `✅ TBO SSR success! TraceId: ${data?.Response?.TraceId}`,
      );
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on SSR. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getSSR(reqBody, endUserIp);
      }

      this.logger.error('❌ TBO SSR API error', error?.message);
      throw new HttpException(
        'Failed to fetch SSR from TBO API',
        HttpStatus.BAD_GATEWAY,
      );
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

    // TBO Validation Rule: If a minor (PaxType 2 or 3) needs a PAN but is using Guardian PAN,
    // it must be sent in GuardianDetails instead of directly on the minor.
    if (payload.Passengers && Array.isArray(payload.Passengers)) {
      const leadAdult = payload.Passengers.find((p) => p.PaxType === 1) || {
        Title: 'Mr',
        FirstName: 'Guardian',
        LastName: 'Unknown',
      };

      payload.Passengers = payload.Passengers.map((pax) => {
        if (pax.PaxType !== 1 && pax.PAN) {
          // It's a minor using a Guardian PAN
          pax.GuardianDetails = {
            Title: leadAdult.Title || 'Mr',
            FirstName: leadAdult.FirstName || 'Guardian',
            LastName: leadAdult.LastName || 'Unknown',
            PAN: pax.PAN,
          };
          delete pax.PAN; // Remove PAN from the minor's root to avoid TBO validation error
        }
        return pax;
      });
    }

    // Strip agency markup from passenger fares so TBO's strict validation passes
    let totalAgencyMarkup = 0;
    if (payload.Passengers && Array.isArray(payload.Passengers)) {
      payload.Passengers.forEach((pax: any) => {
        const paxMarkup = Number(
          pax.Fare?.AgencyMarkup || pax.AgencyMarkup || 0,
        );
        if (paxMarkup > 0) {
          totalAgencyMarkup += paxMarkup;
          if (pax.Fare && typeof pax.Fare.BaseFare === 'number') {
            pax.Fare.BaseFare = Math.max(0, pax.Fare.BaseFare - paxMarkup);
          }
        }
        if (pax.Fare) {
          delete pax.Fare.AgencyMarkup;
          delete pax.Fare.IsDomestic;
        }
        delete pax.AgencyMarkup;
      });
    }

    this.logger.log(`🎫 TBO Book Request for TraceId: ${reqBody.TraceId}`);

    try {
      const response = await tboClient.post(TBO.BOOK_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000, // TBO Book/Ticket can take up to 300 seconds per docs
      });

      const data = response.data;
      console.log(
        '\n================ TBO BOOK REQUEST PAYLOAD ================\n',
        JSON.stringify(payload, null, 2),
      );
      console.log(
        '\n================ TBO BOOK RESPONSE ================\n',
        JSON.stringify(data, null, 2),
      );

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Book returned error: ' + JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.bookFlight(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message:
              tboError?.ErrorMessage || 'Booking failed at airline/TBO level',
            details: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Book success! PNR: ${data?.Response?.Response?.PNR}`,
      );

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
              agencyMarkup: totalAgencyMarkup,
              endUserIp: endUserIp,
              userId: reqBody.userId || '',
              email: reqBody.email || '',
            },
            { upsert: true, new: true },
          );
          this.logger.log(
            `💾 Saved/Updated FlightBooking in DB: ${responseData.BookingId}`,
          );
        }
      } catch (dbError) {
        this.logger.error(
          '❌ Failed to save booking to DB: ' + dbError.message,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Book. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.bookFlight(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Book API error details: ' + JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to book flight with TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
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

    // Strip agency markup from passenger fares so TBO's strict validation passes
    let totalAgencyMarkup = 0;
    if (payload.Passengers && Array.isArray(payload.Passengers)) {
      payload.Passengers.forEach((pax: any) => {
        const paxMarkup = Number(
          pax.Fare?.AgencyMarkup || pax.AgencyMarkup || 0,
        );
        if (paxMarkup > 0) {
          totalAgencyMarkup += paxMarkup;
          if (pax.Fare && typeof pax.Fare.BaseFare === 'number') {
            pax.Fare.BaseFare = Math.max(0, pax.Fare.BaseFare - paxMarkup);
          }
        }
        if (pax.Fare) {
          delete pax.Fare.AgencyMarkup;
          delete pax.Fare.IsDomestic;
        }
        delete pax.AgencyMarkup;
      });
    }

    this.logger.log(`🎫 TBO Ticket Request for TraceId: ${reqBody.TraceId}`);

    try {
      const response = await tboClient.post(TBO.TICKET_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000, // TBO Book/Ticket can take up to 300 seconds per docs
      });

      const data = response.data;
      console.log(
        '\n================ TBO TICKET REQUEST PAYLOAD ================\n',
        JSON.stringify(payload, null, 2),
      );
      console.log(
        '\n================ TBO TICKET RESPONSE ================\n',
        JSON.stringify(data, null, 2),
      );

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Ticket returned error: ' + JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.ticketFlight(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message:
              tboError?.ErrorMessage || 'Ticketing failed at airline/TBO level',
            details: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Ticket success! PNR: ${data?.Response?.Response?.PNR}`,
      );

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
              agencyMarkup: totalAgencyMarkup,
              endUserIp: endUserIp,
              userId: reqBody.userId || '',
              email: reqBody.email || '',
            },
            { upsert: true, new: true },
          );
          this.logger.log(
            `💾 Saved/Updated FlightBooking in DB: ${responseData.BookingId}`,
          );
        }
      } catch (dbError) {
        this.logger.error(
          '❌ Failed to save booking to DB: ' + dbError.message,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Ticket. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.ticketFlight(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Ticket API error details: ' + JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to ticket flight with TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
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

    this.logger.log(
      `🔍 TBO Get Booking Details Request | PNR: ${reqBody.PNR || 'N/A'}, BookingId: ${reqBody.BookingId || 'N/A'}, TraceId: ${reqBody.TraceId || 'N/A'}`,
    );

    try {
      const response = await tboClient.post(TBO.GET_BOOKING_DETAILS_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Get Booking Details returned error: ' +
            JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getBookingDetails(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message: tboError?.ErrorMessage || 'Failed to get booking details',
            details: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Get Booking Details success! PNR: ${data?.Response?.FlightItinerary?.PNR}`,
      );

      // Sync local DB with latest status from TBO
      if (data?.Response?.FlightItinerary) {
        try {
          const itinerary = data.Response.FlightItinerary;
          await this.flightBookingModel.findOneAndUpdate(
            { bookingId: String(itinerary.BookingId || reqBody.BookingId) },
            {
              status: itinerary.Status,
              TicketStatus: itinerary.TicketStatus,
            },
          );
        } catch (dbErr) {
          this.logger.error(
            'Failed to sync booking status with DB: ' + dbErr.message,
          );
        }
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Get Booking Details. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getBookingDetails(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Get Booking Details API error details: ' +
          JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to fetch booking details from TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
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

    this.logger.log(
      `🗑️ TBO Release PNR Request for BookingId: ${reqBody.BookingId}`,
    );

    try {
      const response = await tboClient.post(TBO.RELEASE_PNR_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      console.log(
        '\n================ TBO RELEASE PNR REQUEST PAYLOAD ================\n',
        JSON.stringify(payload, null, 2),
      );
      console.log(
        '\n================ TBO RELEASE PNR RESPONSE ================\n',
        JSON.stringify(data, null, 2),
      );

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Release PNR returned error: ' + JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.releasePNR(reqBody, endUserIp);
        }
        throw new HttpException(
          {
            message:
              tboError?.ErrorMessage ||
              'TBO API rejected the Release PNR request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Release PNR success! BookingId: ${reqBody.BookingId}`,
      );
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Release PNR. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.releasePNR(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Release PNR API error details: ' + JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to release PNR from TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
  // ─── Step 14: Send Change Request (Modify/Cancel Ticketed Booking) ────────
  async sendChangeRequest(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload: any = {
      BookingId: reqBody.BookingId,
      RequestType: reqBody.RequestType,
      CancellationType: reqBody.CancellationType,
      Remarks: reqBody.Remarks || 'Change request submitted via platform.',
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    if (
      reqBody.TicketId &&
      Array.isArray(reqBody.TicketId) &&
      reqBody.TicketId.length > 0
    ) {
      payload.TicketId = reqBody.TicketId;
    }

    if (
      reqBody.Sectors &&
      Array.isArray(reqBody.Sectors) &&
      reqBody.Sectors.length > 0
    ) {
      payload.Sectors = reqBody.Sectors;
    }

    this.logger.log(
      `🔄 TBO Send Change Request for BookingId: ${reqBody.BookingId}, RequestType: ${reqBody.RequestType}`,
    );

    try {
      const response = await tboClient.post(TBO.SEND_CHANGE_REQUEST_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      console.log(
        '\n================ TBO CHANGE REQUEST PAYLOAD ================\n',
        JSON.stringify(payload, null, 2),
      );
      console.log(
        '\n================ TBO CHANGE RESPONSE ================\n',
        JSON.stringify(data, null, 2),
      );

      if (
        data?.Response?.ResponseStatus !== 1 &&
        data?.Response?.ResponseStatus !== 4
      ) {
        // Sometimes 4 is successful partial
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Send Change Request returned error: ' +
            JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.sendChangeRequest(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message:
              tboError?.ErrorMessage || 'TBO API rejected the Change request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Send Change Request success! Ticket Change Requested for: ${reqBody.BookingId}`,
      );

      try {
        const responseData = data?.Response;
        if (responseData && responseData.ChangeRequestId) {
          await this.cancellationModel.findOneAndUpdate(
            { changeRequestId: String(responseData.ChangeRequestId) },
            {
              changeRequestId: String(responseData.ChangeRequestId),
              bookingId: String(reqBody.BookingId),
              cancellationType:
                reqBody.RequestType === 1 || reqBody.RequestType === '1'
                  ? 'FULL_CANCEL'
                  : 'PARTIAL_CANCEL',
              status: 'Processing',
              endUserIp: endUserIp,
            },
            { upsert: true, new: true },
          );

          // Update the main booking document to reflect the cancellation/processing status
          await this.flightBookingModel.findOneAndUpdate(
            { bookingId: String(reqBody.BookingId) },
            { status: 'Processing' },
          );

          this.logger.log(
            `💾 Saved/Updated Cancellation in DB: ${responseData.ChangeRequestId}`,
          );
        }
      } catch (dbError) {
        this.logger.error(
          '❌ Failed to save cancellation to DB: ' + dbError.message,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Send Change Request. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.sendChangeRequest(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Send Change Request API error details: ' +
          JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to send change request to TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
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

    this.logger.log(
      `🔍 TBO Get Change Request Status for ID: ${reqBody.ChangeRequestId}`,
    );

    try {
      const response = await tboClient.post(
        TBO.GET_CHANGE_REQUEST_STATUS_URL,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 25000,
        },
      );

      const data = response.data;
      console.log(
        '\n================ TBO CHANGE STATUS PAYLOAD ================\n',
        JSON.stringify(payload, null, 2),
      );
      console.log(
        '\n================ TBO CHANGE STATUS RESPONSE ================\n',
        JSON.stringify(data, null, 2),
      );

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Get Change Request Status returned error: ' +
            JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getChangeRequestStatus(reqBody, endUserIp);
        }
        throw new HttpException(
          {
            message:
              tboError?.ErrorMessage || 'TBO API rejected the Status request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Get Change Request Status success! Request ID: ${reqBody.ChangeRequestId}`,
      );

      try {
        const responseData = data?.Response;
        if (responseData && responseData.ChangeRequestId) {
          const statusText =
            responseData.ChangeRequestStatus === 1
              ? 'Unassigned'
              : responseData.ChangeRequestStatus === 2
                ? 'Assigned'
                : responseData.ChangeRequestStatus === 3
                  ? 'Acknowledged'
                  : responseData.ChangeRequestStatus === 4
                    ? 'Completed'
                    : responseData.ChangeRequestStatus === 5
                      ? 'Rejected'
                      : responseData.ChangeRequestStatus === 6
                        ? 'InProgress'
                        : 'Pending';

          await this.cancellationModel.findOneAndUpdate(
            { changeRequestId: String(responseData.ChangeRequestId) },
            {
              status: statusText,
              refundAmount: responseData.RefundedAmount || 0,
              cancellationCharge: responseData.CancellationCharge || 0,
              refundDetails: responseData,
            },
            { new: true },
          );

          // If Completed, also mark the original booking as Cancelled
          if (statusText === 'Completed') {
            await this.flightBookingModel.findOneAndUpdate(
              { bookingId: String(responseData.BookingId) }, // Might not be returned here, but we can query by cancellation doc
              { status: 'Cancelled' },
            );
          }
        }
      } catch (dbError) {
        this.logger.error(
          '❌ Failed to update cancellation in DB: ' + dbError.message,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Get Change Request Status. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getChangeRequestStatus(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Get Change Request Status API error details: ' +
          JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to get change request status from TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Step 16: Get Cancellation Charges (Quote) ───────────────────────────
  async getCancellationCharges(reqBody: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      BookingId: reqBody.BookingId,
      RequestType: reqBody.RequestType || '1',
      BookingMode: reqBody.BookingMode || '5',
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(
      `💵 TBO Get Cancellation Charges for BookingId: ${reqBody.BookingId}`,
    );

    try {
      const response = await tboClient.post(
        TBO.GET_CANCELLATION_CHARGES_URL,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 25000,
        },
      );

      const data = response.data;
      console.log(
        '\n================ TBO CANCELLATION REQUEST PAYLOAD ================\n',
        JSON.stringify(payload, null, 2),
      );
      console.log(
        '\n================ TBO CANCELLATION RESPONSE ================\n',
        JSON.stringify(data, null, 2),
      );

      if (data?.Response?.ResponseStatus !== 1) {
        const tboError = data?.Response?.Error;
        this.logger.error(
          '❌ TBO Get Cancellation Charges returned error: ' +
            JSON.stringify(tboError),
        );
        if (
          tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
          tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN
        ) {
          this.logger.warn(
            '⚠️ TBO token expired/invalid. Clearing cache and retrying...',
          );
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.getCancellationCharges(reqBody, endUserIp);
        }

        throw new HttpException(
          {
            message:
              tboError?.ErrorMessage ||
              'TBO API rejected the Cancellation Charges request',
            error: tboError,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `✅ TBO Get Cancellation Charges success! BookingId: ${reqBody.BookingId}`,
      );
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const tboErrorCode = error?.response?.data?.Response?.Error?.ErrorCode;
      if (
        tboErrorCode === TBO_ERROR_TOKEN_EXPIRED ||
        tboErrorCode === TBO_ERROR_INVALID_TOKEN
      ) {
        this.logger.warn(
          '⚠️ TBO token expired/invalid on Get Cancellation Charges. Clearing cache and retrying...',
        );
        this.cachedToken = null;
        this.tokenExpiry = 0;
        return this.getCancellationCharges(reqBody, endUserIp);
      }

      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Get Cancellation Charges API error details: ' +
          JSON.stringify(responseData),
      );

      throw new HttpException(
        {
          message: 'Failed to get cancellation charges from TBO API',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── DB Fetch Methods ───────────────────────────────────────────

  async getMyBookings(reqBody: any, endUserIp: string) {
    try {
      this.logger.log(`getMyBookings reqBody: ${JSON.stringify(reqBody)}`);

      // Allow filtering by userId, email, or phone
      const filter: any = {};
      if (reqBody.userId) filter.userId = reqBody.userId;
      else if (reqBody.email) filter.email = reqBody.email;
      else if (reqBody.phone) filter.phone = reqBody.phone;

      if (Object.keys(filter).length === 0) {
        this.logger.log(
          `getMyBookings: No valid identifier provided, returning []`,
        );
        return { success: true, data: [] };
      }

      const query: any = filter;
      this.logger.log(`getMyBookings query: ${JSON.stringify(query)}`);
      const bookings = await this.flightBookingModel
        .find(query)
        .sort({ createdAt: -1 })
        .exec();
      this.logger.log(`getMyBookings found ${bookings.length} flights`);
      return { success: true, data: bookings };
    } catch (e) {
      throw new HttpException(
        { message: 'Failed to fetch bookings', details: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getMyCancellations(reqBody: any, endUserIp: string) {
    try {
      const filter: any = {};
      if (reqBody.userId) filter.userId = reqBody.userId;
      else if (reqBody.email) filter.email = reqBody.email;
      else if (reqBody.bookingId) filter.bookingId = String(reqBody.bookingId);

      if (Object.keys(filter).length === 0) {
        this.logger.log(
          `getMyCancellations: No valid filter provided, returning []`,
        );
        return { success: true, data: [] };
      }

      const cancellations = await this.cancellationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .exec();
      return { success: true, data: cancellations };
    } catch (e) {
      throw new HttpException(
        { message: 'Failed to fetch cancellations', details: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getCancellationByBooking(reqBody: any, endUserIp: string) {
    try {
      if (!reqBody.BookingId) {
        throw new Error('BookingId is required');
      }
      // Get the most recent cancellation request for this booking
      const cancellation = await this.cancellationModel
        .findOne({ bookingId: String(reqBody.BookingId) })
        .sort({ createdAt: -1 })
        .exec();

      if (!cancellation) {
        return { success: true, data: null };
      }

      // If it's pending/processing, try to fetch the latest status from TBO
      if (
        cancellation.status === 'Pending' ||
        cancellation.status === 'Processing'
      ) {
        try {
          const statusRes = await this.getChangeRequestStatus(
            { ChangeRequestId: cancellation.changeRequestId },
            endUserIp,
          );
          // getChangeRequestStatus already updates the DB internally
          // Refetch after update
          const updated = await this.cancellationModel
            .findOne({ changeRequestId: cancellation.changeRequestId })
            .exec();
          return { success: true, data: updated };
        } catch (err) {
          this.logger.error(
            'Failed to sync cancellation status with TBO: ' + err.message,
          );
        }
      }

      return { success: true, data: cancellation };
    } catch (e) {
      throw new HttpException(
        {
          message: 'Failed to fetch cancellation by booking',
          details: e.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Admin: Get all flight bookings
   */
  async getAllFlightBookings() {
    try {
      const bookings = await this.flightBookingModel
        .find()
        .sort({ createdAt: -1 })
        .exec();
      return { success: true, count: bookings.length, data: bookings };
    } catch (error) {
      this.logger.error('Failed to get all flight bookings', error?.message);
      return { success: false, data: [] };
    }
  }
}
