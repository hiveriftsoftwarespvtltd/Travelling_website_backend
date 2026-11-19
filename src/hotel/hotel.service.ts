import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as fs from 'fs';
import { HotelCity, HotelCityDocument } from './schemas/hotel-city.schema';
import {
  HotelProperty,
  HotelPropertyDocument,
} from './schemas/hotel-property.schema';
import {
  HotelBooking,
  HotelBookingDocument,
} from './schemas/hotel-booking.schema';

// ─── TBO Shared Auth (for Hotel B2B APIs) ────────────────────────────────
const getAuthUrl = () => {
  const base = process.env.TBO_HOTEL_AUTH_BASE_URL || 'http://Sharedapi.tektravels.com/SharedData.svc/rest';
  return base.endsWith('/Authenticate') ? base : `${base.replace(/\/+$/, '')}/Authenticate`;
};

// ─── TBO Hotel API Endpoints ─────────────────────────────────────────────────
// Affiliate (Search + PreBook) — no TokenId in body, use Basic Auth from JiyoLife credentials
const HOTEL_SEARCH_URL = 'https://affiliate.tektravels.com/HotelAPI/Search';
const HOTEL_PREBOOK_URL = 'https://affiliate.tektravels.com/HotelAPI/PreBook';
// B2B (Book, GetBookingDetail, GenerateVoucher, SendChangeRequest) — require TokenId in body
const HOTEL_BOOK_URL =
  'https://HotelBE.tektravels.com/hotelservice.svc/rest/Book';
const HOTEL_BOOKING_DETAIL_URL =
  'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetBookingDetail';
const HOTEL_VOUCHER_URL =
  'https://HotelBE.tektravels.com/hotelservice.svc/rest/GenerateVoucher';
const HOTEL_CHANGE_REQUEST_URL =
  'https://HotelBE.tektravels.com/hotelservice.svc/rest/SendChangeRequest';
const HOTEL_CHANGE_REQUEST_STATUS_URL =
  'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetChangeRequestStatus';
const HOTEL_ROOMS_URL =
  'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetHotelRoom';

// Static / Content APIs (Basic Auth — no token needed)
const STATIC_BASE_URL = 'http://api.tbotechnology.in/TBOHolidays_HotelAPI';
const STATIC_COUNTRY_LIST = `${STATIC_BASE_URL}/CountryList`;
const STATIC_CITY_LIST = `${STATIC_BASE_URL}/CityList`;
const STATIC_HOTEL_DETAILS = `${STATIC_BASE_URL}/Hoteldetails`;
const STATIC_HOTEL_CODES = `${STATIC_BASE_URL}/hotelcodelist`;
const STATIC_TBO_HOTEL_CODES = `${STATIC_BASE_URL}/TBOHotelCodeList`;

// ─── TBO Credentials ─────────────────────────────────────────────────────────
// B2B Auth credentials (used for Authenticate → TokenId flow)
const AUTH_CREDENTIALS = {
  get ClientId() {
    return (process.env.TBO_HOTEL_CLIENT_ID || 'ApiIntegrationNew').trim();
  },
  get UserName() {
    return (process.env.TBO_HOTEL_USERNAME || 'Lifejiyo').trim();
  },
  get Password() {
    return (process.env.TBO_HOTEL_PASSWORD || 'Lifejiyo@123').trim();
  },
};

// Affiliate API uses Basic Auth with JiyoLife Hotel credentials (separate from B2B flight creds)
const AFFILIATE_AUTH = {
  get username() {
    return process.env.TBO_HOTEL_USERNAME || process.env.TBO_USERNAME || 'Lifejiyo';
  },
  get password() {
    return process.env.TBO_HOTEL_PASSWORD || process.env.TBO_PASSWORD || 'Lifejiyo@123';
  },
};

// Static API uses Basic Auth with TBO test credentials
const STATIC_API_AUTH = {
  get username() {
    return process.env.TBO_STATIC_API_USER || 'TBOStaticAPITest';
  },
  get password() {
    return process.env.TBO_STATIC_API_PASSWORD || 'Tbo@11530818';
  },
};

// ─── TBO Error Codes ──────────────────────────────────────────────────────────
const TBO_ERROR_TOKEN_EXPIRED = 6;
const TBO_ERROR_INVALID_TOKEN = 7;

import { PaymentService } from '../payment/payment.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class HotelService implements OnModuleInit {
  private readonly logger = new Logger(HotelService.name);

  constructor(
    @InjectModel(HotelCity.name) private cityModel: Model<HotelCityDocument>,
    @InjectModel(HotelProperty.name)
    private propertyModel: Model<HotelPropertyDocument>,
    @InjectModel(HotelBooking.name)
    private bookingModel: Model<HotelBookingDocument>,
    private paymentService: PaymentService,
    private mailService: MailService,
  ) {}

  // In-memory token cache (shared auth, same as flights)
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  // ─── Auth Token ────────────────────────────────────────────────────────────
  private async getToken(endUserIp: string): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      this.logger.log(
        `✅ Using cached TBO token (expires in ${Math.round((this.tokenExpiry - now) / 60000)} min)`,
      );
      return this.cachedToken;
    }

    this.logger.log(
      `🔐 Fetching new TBO auth token for Hotel API | IP: ${endUserIp}`,
    );
    const authIp = process.env.END_USER_IP || '68.178.170.69';
    try {
      const response = await axios.post(
        getAuthUrl(),
        { ...AUTH_CREDENTIALS, EndUserIp: authIp },
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
      this.tokenExpiry = now + 3 * 60 * 60 * 1000; // Cache 3 hours
      this.logger.log(`✅ TBO Hotel Token obtained`);
      return this.cachedToken as string;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to authenticate with TBO Hotel API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Helper: Clear token on expiry ────────────────────────────────────────
  private clearToken() {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  // ─── Helper: Parse Star Rating to Number (1 to 5) ────────────────────────
  private parseRatingToNumber(rating: any): number {
    if (typeof rating === 'number') {
      return Math.max(1, Math.min(5, Math.round(rating)));
    }
    if (!rating) return 3;
    const s = String(rating).toLowerCase();
    if (s.includes('five') || s.includes('5')) return 5;
    if (s.includes('four') || s.includes('4')) return 4;
    if (s.includes('three') || s.includes('3')) return 3;
    if (s.includes('two') || s.includes('2')) return 2;
    if (s.includes('one') || s.includes('1')) return 1;
    return 3;
  }

  // ─── Helper: Deterministic Curated Luxury Hotel Image Pool ───────────────
  private getCuratedFallbackImage(hotelCode: string): string {
    const images = [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
    ];
    let hash = 0;
    const str = String(hotelCode || '0');
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % images.length;
    return images[idx];
  }

  // ─── Helper: Augment Hotel Search Results with Static Metadata & Images ───
  private async augmentHotelResults(
    hotelResults: any[],
    cityHotelsMap?: Map<string, any>,
  ): Promise<any[]> {
    if (!hotelResults || hotelResults.length === 0) return [];

    // Step 1: Pre-populate from cityHotelsMap (Name, Rating, Address from TBOHotelCodeList)
    const augmented = hotelResults.map((h) => {
      const code = String(h.HotelCode || '');
      const cityInfo = cityHotelsMap?.get(code);
      const name = h.HotelName || cityInfo?.HotelName || `Hotel ${code}`;
      const rating = h.HotelRating || cityInfo?.HotelRating || 3;
      const starRatingNum = this.parseRatingToNumber(h.StarRating || rating);
      const address = h.HotelAddress || cityInfo?.Address || '';
      return {
        ...h,
        HotelName: name,
        HotelRating: rating,
        StarRating: starRatingNum,
        HotelAddress: address,
        HotelPicture: h.HotelPicture || '',
      };
    });

    // Step 2: Fetch detailed static data (Real photos, amenities, etc.) from TBO STATIC_HOTEL_DETAILS
    const uniqueCodes = Array.from(
      new Set(augmented.map((h) => String(h.HotelCode)).filter(Boolean)),
    );

    if (uniqueCodes.length > 0) {
      try {
        // Chunk into groups of 50 to respect TBO limits and ensure quick parallel responses
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueCodes.length; i += 50) {
          chunks.push(uniqueCodes.slice(i, i + 50));
        }

        const detailPromises = chunks.map(async (chunk) => {
          try {
            const res = await axios.post(
              STATIC_HOTEL_DETAILS,
              { Hotelcodes: chunk.join(','), Language: 'EN' },
              {
                auth: STATIC_API_AUTH,
                headers: { 'Content-Type': 'application/json' },
                timeout: 8000,
              },
            );
            return res.data?.HotelDetails || [];
          } catch (err) {
            this.logger.warn(`Static details chunk fetch error: ${err?.message}`);
            return [];
          }
        });

        const settled = await Promise.allSettled(detailPromises);
        const staticMap = new Map<string, any>();
        for (const s of settled) {
          if (s.status === 'fulfilled' && Array.isArray(s.value)) {
            for (const item of s.value) {
              if (item.HotelCode) staticMap.set(String(item.HotelCode), item);
            }
          }
        }

        for (const h of augmented) {
          const code = String(h.HotelCode);
          const details = staticMap.get(code);
          if (details) {
            if (details.HotelName) h.HotelName = details.HotelName;
            if (details.Image || details.HotelPicture) {
              h.HotelPicture = details.Image || details.HotelPicture;
            } else if (Array.isArray(details.Images) && details.Images.length > 0) {
              h.HotelPicture = details.Images[0];
            }
            if (Array.isArray(details.Images)) {
              h.Images = details.Images;
            }
            if (details.HotelRating || details.StarRating) {
              h.HotelRating = details.HotelRating || details.StarRating;
              h.StarRating = this.parseRatingToNumber(details.HotelRating || details.StarRating);
            }
            if (details.Address) h.HotelAddress = details.Address;
            if (details.HotelFacilities) h.HotelFacilities = details.HotelFacilities;
            if (details.Description) h.Description = details.Description;
          }
        }
      } catch (err) {
        this.logger.warn(`Failed during static detail augmentation: ${err?.message}`);
      }
    }

    // Step 3: Fallback assurance for any hotel missing a photo or star rating
    for (const h of augmented) {
      if (
        !h.HotelPicture ||
        !h.HotelPicture.startsWith('http') ||
        h.HotelPicture.includes('HotelNA')
      ) {
        h.HotelPicture = this.getCuratedFallbackImage(String(h.HotelCode));
      }
      if (!h.StarRating) {
        h.StarRating = this.parseRatingToNumber(h.HotelRating || 3);
      }
    }

    this.logger.log(`✅ Successfully augmented ${augmented.length} hotel results with names, ratings, and photos`);
    return augmented;
  }

  // ─── 1. Search Hotels ──────────────────────────────────────────────────────
  // POST https://affiliate.tektravels.com/HotelAPI/Search
  // Affiliate API — uses Basic Auth (JiyoLife credentials), NO TokenId in body
  // Request: { CheckIn, CheckOut (YYYY-MM-DD), HotelCodes, GuestNationality,
  //            PaxRooms:[{Adults,Children,ChildrenAges}], ResponseTime, IsDetailedResponse, Filters }
  // Response: { Status:{Code:200}, HotelResult:[{HotelCode, Currency, Rooms:[{Name[],BookingCode,Inclusion,DayRates,TotalFare,TotalTax,CancelPolicies,MealType,IsRefundable}]}] }
  // ──────────────────────────────────────────────────────────────────────────
  async searchHotels(body: any, endUserIp: string) {
    const sanitizedPaxRooms = (
      body.PaxRooms || [{ Adults: 1, Children: 0 }]
    ).map((room) => {
      const sanitizedRoom: any = {
        Adults: room.Adults || 1,
        Children: room.Children || 0,
      };
      if (sanitizedRoom.Children > 0 && Array.isArray(room.ChildrenAges)) {
        sanitizedRoom.ChildrenAges = room.ChildrenAges;
      } else {
        sanitizedRoom.ChildrenAges = [];
      }
      return sanitizedRoom;
    });

    // Affiliate API payload — dates in YYYY-MM-DD format directly
    const payload: any = {
      CheckIn: body.CheckIn, // YYYY-MM-DD
      CheckOut: body.CheckOut, // YYYY-MM-DD
      GuestNationality: body.GuestNationality || 'IN',
      PaxRooms: sanitizedPaxRooms,
      ResponseTime: 23.0,
      IsDetailedResponse: true,
      Filters: {
        Refundable: false,
        NoOfRooms: 0, // 0 returns all available room types as recommended by TBO
        MealType: 'All',
        StarRating: 'All',
      },
    };

    const cityHotelsMap = new Map<string, any>();

    // HotelCodes filter (comma-separated string)
    if (body.HotelCodes) {
      payload.HotelCodes = body.HotelCodes;
    } else if (body.CityCode || body.CityId) {
      // Affiliate API requires HotelCodes. Fetch codes for the city and pass up to 150
      const cityId = String(body.CityCode || body.CityId);
      try {
        const hotelCodesRes = await this.getHotelCodesByCity(cityId);

        if (hotelCodesRes?.Status?.Code && hotelCodesRes.Status.Code !== 200) {
          throw new HttpException(
            `TBO Static Error: ${hotelCodesRes.Status.Description}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const hotels = hotelCodesRes?.Hotels || [];
        if (hotels.length > 0) {
          for (const h of hotels) {
            if (h.HotelCode) {
              cityHotelsMap.set(String(h.HotelCode), h);
            }
          }
          // TBO certification rule: batches of max 100 HotelCodes sent in parallel
          const hotelBatches: string[] = [];
          const maxHotelsToSearch = hotels.slice(0, 300); // Up to 3 parallel requests = 300 hotels
          for (let i = 0; i < maxHotelsToSearch.length; i += 100) {
            hotelBatches.push(
              maxHotelsToSearch
                .slice(i, i + 100)
                .map((h: any) => h.HotelCode)
                .join(','),
            );
          }
          payload.HotelCodes = hotelBatches[0];
          (payload as any)._allBatches = hotelBatches;
        } else {
          fs.appendFileSync(
            'search_debug.log',
            `[${new Date().toISOString()}] No hotels found in city ${cityId}\nBody: ${JSON.stringify(body)}\nAPI Response: ${JSON.stringify(hotelCodesRes)}\n\n`,
          );
          throw new HttpException(
            'No hotels found in the given city',
            HttpStatus.BAD_REQUEST,
          );
        }
      } catch (err) {
        if (err instanceof HttpException) throw err;
        this.logger.warn(`Failed to fetch hotel codes for city ${cityId}`);
        throw new HttpException(
          'Failed to resolve hotels for this city',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      throw new HttpException(
        'Either HotelCodes or CityCode is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const allBatches: string[] = (payload as any)._allBatches || (payload.HotelCodes ? [payload.HotelCodes] : []);
    delete (payload as any)._allBatches;

    try {
      // If city has >100 hotels, send parallel requests of max 100 codes each as required by TBO
      if (allBatches.length > 1) {
        this.logger.log(
          `🏨 TBO Parallel Searches: Sending ${allBatches.length} parallel requests of max 100 hotel codes each as mandated by TBO`,
        );

        const parallelRequests = allBatches.map(async (batchCodes) => {
          const bCount = batchCodes.split(',').filter(Boolean).length;
          const bResponseTime = Math.min(23.0, Math.max(5.0, Number((5.0 + (bCount / 100) * 18.0).toFixed(1))));
          const bPayload = {
            ...payload,
            HotelCodes: batchCodes,
            ResponseTime: bResponseTime,
          };

          const res = await axios.post(HOTEL_SEARCH_URL, bPayload, {
            auth: AFFILIATE_AUTH,
            headers: { 'Content-Type': 'application/json' },
            timeout: 45000,
          });
          return res.data;
        });

        const results = await Promise.allSettled(parallelRequests);
        const combinedHotelResults: any[] = [];
        let finalStatus = { Code: 200, Description: 'Successful' };

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value?.HotelResult) {
            combinedHotelResults.push(...r.value.HotelResult);
            if (r.value?.Status?.Code === 200) finalStatus = r.value.Status;
          }
        }

        const count = combinedHotelResults.length;
        this.logger.log(`✅ TBO Parallel Hotel Search found ${count} hotels across ${allBatches.length} parallel batches`);

        const augmentedResults = await this.augmentHotelResults(combinedHotelResults, cityHotelsMap);

        return {
          Status: finalStatus,
          HotelResult: augmentedResults,
        };
      }

      // Single batch execution (<= 100 hotel codes)
      const hotelCount = payload.HotelCodes ? payload.HotelCodes.split(',').filter(Boolean).length : 1;
      payload.ResponseTime = Math.min(23.0, Math.max(5.0, Number((5.0 + (hotelCount / 100) * 18.0).toFixed(1))));

      this.logger.log(
        `🏨 Affiliate Hotel Search: CheckIn=${payload.CheckIn} CheckOut=${payload.CheckOut} HotelCodesCount=${hotelCount} ResponseTime=${payload.ResponseTime}s HotelCodes=${payload.HotelCodes ? payload.HotelCodes.substring(0, 50) + '...' : 'none'}`,
      );

      const response = await axios.post(HOTEL_SEARCH_URL, payload, {
        auth: AFFILIATE_AUTH, // Basic Auth with JiyoLife credentials
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      });

      const data = response.data;
      // Affiliate response: { Status: {Code:200, Description:"Successful"}, HotelResult: [...] }
      if (!data || data.Status?.Code !== 200) {
        const errMsg = data?.Status?.Description || 'Hotel search failed';
        this.logger.warn(`⚠️ Affiliate Hotel Search: ${errMsg}`);
        fs.appendFileSync(
          'search_debug.log',
          `[${new Date().toISOString()}] Affiliate Search Failed: ${errMsg}\nPayload: ${JSON.stringify(payload)}\nResponse: ${JSON.stringify(data)}\n\n`,
        );
        return {
          Status: data?.Status || { Code: 400, Description: errMsg },
          HotelResult: [],
        };
      }

      const count = data?.HotelResult?.length ?? 0;
      this.logger.log(`✅ Affiliate Hotel Search found ${count} hotels`);

      if (count > 0) {
        data.HotelResult = await this.augmentHotelResults(data.HotelResult, cityHotelsMap);
      }

      // Return Affiliate response directly — frontend will handle HotelResult[] format
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ Affiliate Hotel Search error', error?.message);
      throw new HttpException(
        'Failed to search hotels from TBO Affiliate API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── 2. Pre-Book Hotel ─────────────────────────────────────────────────────
  // POST https://affiliate.tektravels.com/HotelAPI/PreBook
  // Affiliate API — uses Basic Auth (JiyoLife credentials), NO TokenId in body
  // Request: { BookingCode: "...", PaymentMode: "Limit" }
  // Response: { Status:{Code:200}, HotelResult:[{HotelCode, Currency, Rooms:[{BookingCode,NetAmount,NetTax,TotalFare,TotalTax,CancelPolicies,Amenities,PriceBreakUp}], RateConditions[], ValidationInfo }] }
  // ──────────────────────────────────────────────────────────────────────────
  async preBookHotel(body: any, endUserIp: string) {
    if (!body.BookingCode) {
      throw new HttpException(
        'BookingCode is required for PreBook',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Affiliate PreBook payload — only BookingCode + PaymentMode
    const payload = {
      BookingCode: body.BookingCode,
      PaymentMode: 'Limit',
    };

    this.logger.log(
      `🛎️ Affiliate Hotel PreBook: BookingCode=${payload.BookingCode}`,
    );

    try {
      const response = await axios.post(HOTEL_PREBOOK_URL, payload, {
        auth: AFFILIATE_AUTH, // Basic Auth with JiyoLife credentials
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      });

      const data = response.data;
      // Affiliate PreBook response: { Status:{Code:200}, HotelResult:[{HotelCode, Currency, Rooms:[...], RateConditions, ValidationInfo}] }
      if (!data || data.Status?.Code !== 200) {
        const errMsg = data?.Status?.Description || 'Hotel pre-book failed';
        this.logger.warn(`⚠️ Affiliate Hotel PreBook failed: ${errMsg}`);
        throw new HttpException(
          { message: errMsg, raw: data },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`✅ Affiliate Hotel PreBook success`);

      // Return Affiliate response directly — frontend will parse HotelResult[0].Rooms[0].NetAmount etc.
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ Affiliate Hotel PreBook error', error?.message);
      throw new HttpException(
        'Failed to pre-book hotel with TBO Affiliate API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── 3. Book Hotel ─────────────────────────────────────────────────────────
  // POST https://HotelBE.tektravels.com/hotelservice.svc/rest/book
  // BookingCode from Affiliate PreBook must be at ROOT level (not inside HotelRoomsDetails)
  // NetAmount from Affiliate PreBook response (HotelResult[0].Rooms[0].NetAmount)
  // ──────────────────────────────────────────────────────────────────────────
  async bookHotel(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);
    const clientRef =
      body.ClientReferenceNumber ||
      `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Auto-extract TraceId from BookingCode if not provided (Format: <Code>!TB!<Index>!TB!<TraceId>!TB!<Policy>!TB!AFF!)
    let traceId = (body.TraceId || '').toString().trim();
    if (!traceId && body.BookingCode) {
      const parts = body.BookingCode.split('!TB!');
      if (parts.length >= 3 && parts[2]) {
        traceId = parts[2].trim();
      }
    }

    const payload: any = {
      BookingCode: body.BookingCode, // ← CRITICAL: must be at root level for Affiliate BookingCodes
      ClientReferenceNo: Math.floor(Date.now() / 1000), // MUST BE INT32
      IsVoucherBooking: body.IsVoucherBooking ?? true,
      GuestNationality: body.GuestNationality || 'IN',
      EndUserIp: endUserIp,
      TokenId: tokenId,
      TraceId: traceId,
      ResultIndex: Number(body.ResultIndex || 1),
      HotelCode: body.HotelCode || '',
      RequestedBookingMode: body.RequestedBookingMode || 5,
      NetAmount: body.NetAmount || 0, // NetAmount from Affiliate PreBook response
      ClientReferenceId: clientRef,
      ...(body.IsCorporate ? { IsCorporate: true } : {}),
      ...(body.IsPackageFare ? { IsPackageFare: true } : {}),
      ...(body.ArrivalTransport
        ? { ArrivalTransport: body.ArrivalTransport }
        : {}),
      ...(body.DepartureTransport
        ? { DepartureTransport: body.DepartureTransport }
        : {}),
      HotelRoomsDetails: (body.HotelRoomsDetails || []).map((r) => ({
        RoomIndex: r.RoomIndex,
        RoomTypeCode: r.RoomTypeCode,
        RoomTypeName: r.RoomTypeName,
        RatePlanCode: r.RatePlanCode,
        BedTypeCode: r.BedTypeCode || null,
        SmokingPreference: r.SmokingPreference || 0,
        Supplements: r.Supplements || null,
        Price: r.Price,
        HotelPassenger: (r.HotelPassenger || []).map((p) => {
          // TBO certification rule: Only Mr, Ms, Mrs are accepted (no Master or Miss)
          let title = (p.Title || 'Mr').trim();
          if (title.toLowerCase() === 'master') title = 'Mr';
          if (title.toLowerCase() === 'miss') title = 'Ms';
          if (!['Mr', 'Ms', 'Mrs'].includes(title)) {
            title = 'Mr';
          }

          return {
            Title: title,
            FirstName:
              typeof p.FirstName === 'string' ? p.FirstName.trim() : p.FirstName,
            MiddleName: p.MiddleName || '',
            LastName:
              typeof p.LastName === 'string' ? p.LastName.trim() : p.LastName,
            PaxType: p.PaxType || 1,
            LeadPassenger: p.LeadPassenger || false,
            Age: p.Age || 30,
            Email:
              typeof p.Email === 'string'
                ? p.Email.trim()
                : p.Email || 'guest@example.com',
            Phoneno: p.Phoneno
              ? p.Phoneno.replace(/\D/g, '').substring(0, 15)
              : '9999999999',
            PaxId: p.PaxId || 1,
            GSTCompanyAddress: p.GSTCompanyAddress || null,
            GSTCompanyContactNumber: p.GSTCompanyContactNumber || null,
            GSTCompanyName: p.GSTCompanyName || null,
            GSTNumber: p.GSTNumber || null,
            GSTCompanyEmail: p.GSTCompanyEmail || null,
            // TBO certification rule: Only pass PAN if isPanMandatory is true
            ...(body.isPanMandatory && p.PAN ? { PAN: p.PAN } : {}),
            PassportNo: p.PassportNo || null,
            PassportIssueDate: p.PassportIssueDate || null,
            PassportExpDate: p.PassportExpDate || null,
          };
        }),
      })),
    };

    // 1. Create DB Record (Initial State: BOOKING_IN_PROGRESS)
    const bookingRecord = new this.bookingModel({
      bookingId: 'PENDING',
      clientReferenceNo: clientRef,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      status: 'BOOKING_IN_PROGRESS',
      hotelDetails: {
        ...(body.hotelDetails || {}),
        CheckInDate: body.checkInDate,
        CheckOutDate: body.checkOutDate,
      },
      roomDetails: body.roomDetails || {},
      guestDetails: body.HotelRoomsDetails,
      fareDetails: {
        NetAmount: body.NetAmount,
        TotalFare: body.TotalFare || body.NetAmount,
      },
      endUserIp,
      userId: body.userId || '',
      email: body.email || '',
      traceId: traceId,
      apiLogs: { request: payload },
    });
    await bookingRecord.save();

    this.logger.log(
      `📋 TBO Hotel Book: BookingCode=${body.BookingCode} TraceId=${body.TraceId} HotelCode=${body.HotelCode}`,
    );
    this.logger.log(`FULL BOOK PAYLOAD: ${JSON.stringify(payload)}`);

    try {
      const authHeader =
        'Basic ' +
        Buffer.from(
          AFFILIATE_AUTH.username + ':' + AFFILIATE_AUTH.password,
        ).toString('base64');
      const response = await axios.post(HOTEL_BOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        timeout: 120000,
      });

      const data = response.data;
      const bookResult = data?.BookResult || data;
      const statusCode =
        bookResult?.Status?.Code ??
        data?.Status?.Code ??
        bookResult?.ResponseStatus ??
        bookResult?.Status;

      bookingRecord.apiLogs.response = data;

      if (statusCode !== 200 && statusCode !== 1 && !bookResult?.BookingId) {
        const errMsg =
          bookResult?.Error?.ErrorMessage ||
          bookResult?.Status?.Description ||
          data?.Status?.Description ||
          'Hotel booking failed';
        this.logger.error(`❌ TBO Hotel Book failed: ${errMsg}`);

        bookingRecord.status = 'FAILED';
        bookingRecord.apiLogs.error = errMsg;

        // Auto Refund if payment ID is present
        if (bookingRecord.razorpayPaymentId) {
          const refundAmount = bookingRecord.fareDetails?.TotalFare || bookingRecord.fareDetails?.NetAmount;
          const refundRes = await this.paymentService.processRefund(
            bookingRecord.razorpayPaymentId,
            refundAmount,
            { reason: 'TBO Hotel booking failed: ' + errMsg },
          );
          if (refundRes.success) {
            bookingRecord.status = 'REFUND_INITIATED';
            bookingRecord.bookingId = `REFUND-${Date.now().toString().slice(-4)}`;
          }
        }
        bookingRecord.markModified('apiLogs');
        await bookingRecord.save();

        throw new HttpException(
          { message: errMsg, details: data },
          HttpStatus.BAD_REQUEST,
        );
      }

      bookingRecord.apiLogs.response = bookResult;
      bookingRecord.status = 'CONFIRMED';
      bookingRecord.bookingId = bookResult?.BookingId?.toString() || 'UNKNOWN';
      bookingRecord.confirmationNo = bookResult?.ConfirmationNo;
      await bookingRecord.save();
      this.logger.log(
        `✅ TBO Hotel Book success! BookingId: ${bookResult.BookingId}`,
      );

      // Try to send confirmation email
      try {
        if (bookingRecord.email) {
          const hotelName = bookingRecord.hotelDetails?.HotelName || 'Hotel';
          const checkIn = bookingRecord.hotelDetails?.CheckInDate || '';
          const checkOut = bookingRecord.hotelDetails?.CheckOutDate || '';
          const guest = bookingRecord.guestDetails?.[0]?.HotelPassenger?.[0];
          const guestName = guest
            ? `${guest.FirstName || ''} ${guest.LastName || ''}`.trim() ||
              'Guest'
            : 'Guest';
          const pnr = bookResult.ConfirmationNo || 'Pending';
          const bookingDate = new Date().toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          const roomName =
            bookingRecord.roomDetails?.RoomTypeName ||
            bookingRecord.guestDetails?.[0]?.RoomTypeName ||
            'Standard Room';
          const totalAmount = bookingRecord.fareDetails?.NetAmount || 0;

          await this.mailService.sendHotelBookingConfirmation(
            bookingRecord.email,
            {
              bookingId: bookResult.BookingId,
              pnr,
              bookingDate,
              hotelName,
              roomName,
              checkIn,
              checkOut,
              guestName,
              totalAmount,
            },
          );
        }
      } catch (mailErr) {
        this.logger.error(
          `Failed to send confirmation email for booking ${bookResult.BookingId}`,
          mailErr.stack,
        );
      }

      // Trigger Voucher Generation Asynchronously
      if (bookingRecord.status === 'CONFIRMED' && bookResult?.BookingId) {
        this.generateVoucherAsync(
          bookResult.BookingId,
          endUserIp,
          bookingRecord._id.toString(),
        );
      }

      return data;
    } catch (error) {
      bookingRecord.status = 'FAILED';
      bookingRecord.apiLogs = bookingRecord.apiLogs || {};
      bookingRecord.apiLogs.error = error?.response?.data || error?.message;

      // Auto Refund if payment ID is present
      if (
        bookingRecord.razorpayPaymentId &&
        bookingRecord.status !== 'REFUND_INITIATED'
      ) {
        const refundRes = await this.paymentService.processRefund(
          bookingRecord.razorpayPaymentId,
          bookingRecord.fareDetails.NetAmount,
          { reason: 'TBO Hotel booking failed' },
        );
        if (refundRes.success) {
          bookingRecord.status = 'REFUND_INITIATED';
        }
      }
      bookingRecord.markModified('apiLogs');
      await bookingRecord.save();

      if (error instanceof HttpException) throw error;
      const responseData = error?.response?.data || error?.message;
      this.logger.error(
        '❌ TBO Hotel Book API error: ' + JSON.stringify(responseData),
      );
      throw new HttpException(
        {
          message: 'Hotel booking failed. Please try again.',
          details: responseData,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Internal Helper: Generate Voucher Async ────────────────────────────────
  private async generateVoucherAsync(
    bookingId: number,
    endUserIp: string,
    recordId: string,
  ) {
    try {
      this.logger.log(
        `🔄 Triggering async voucher generation for BookingId: ${bookingId}`,
      );
      const data = await this.generateVoucher(
        { BookingId: bookingId },
        endUserIp,
      );

      const voucherData = data?.GenerateVoucherResult || data;
      if (voucherData) {
        await this.bookingModel.findByIdAndUpdate(recordId, {
          $set: {
            voucherDetails: voucherData,
            confirmationNo: voucherData?.Voucher?.ConfirmationNo || 'Pending',
          },
        });
        this.logger.log(`✅ Async voucher saved for BookingId: ${bookingId}`);
      }
    } catch (err) {
      this.logger.error(
        `❌ Async voucher generation failed for BookingId: ${bookingId}`,
        err?.message,
      );
    }
  }

  // ─── Get My Bookings ────────────────────────────────────────────────────────
  async getMyBookings(userId?: string, email?: string, phone?: string) {
    const conditions: any[] = [];
    if (userId) conditions.push({ userId });
    if (email) {
      conditions.push({ email });
      conditions.push({ 'guestDetails.HotelPassenger.Email': email });
    }
    if (phone) {
      conditions.push({ phone });
      conditions.push({ 'guestDetails.HotelPassenger.Phoneno': phone });
    }

    if (conditions.length === 0) {
      return [];
    }

    const bookings = await this.bookingModel
      .find({ $or: conditions })
      .sort({ createdAt: -1 })
      .exec();
    return bookings;
  }

  // ─── Get Hotel Rooms ───────────────────────────────────────────────────────
  async getHotelRooms(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ResultIndex: Number(body.ResultIndex),
      HotelCode: body.HotelCode,
      TraceId: body.TraceId,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(
      `🛎️ TBO GetHotelRoom: HotelCode=${payload.HotelCode} TraceId=${payload.TraceId} ResultIndex=${payload.ResultIndex}`,
    );

    try {
      const response = await axios.post(HOTEL_ROOMS_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      const getHotelRoomResult = data?.GetHotelRoomResult;

      if (!getHotelRoomResult || getHotelRoomResult.ResponseStatus !== 1) {
        const errMsg =
          getHotelRoomResult?.Error?.ErrorMessage ||
          'Failed to fetch room details';
        this.logger.warn(`⚠️ TBO GetHotelRoom: ${errMsg}`);
        if (errMsg.toLowerCase().includes('token')) {
          this.clearToken();
          return this.getHotelRooms(body, endUserIp);
        }
        throw new HttpException(
          { message: errMsg, raw: data },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Map B2B room pricing fields to what frontend expects
      const mappedRooms = (getHotelRoomResult.HotelRoomsDetails || []).map(
        (r) => ({
          ...r,
          TotalFare: r.Price?.PublishedPrice ?? 0,
          IsRefundable: r.LastCancellationDate
            ? new Date(r.LastCancellationDate) > new Date()
            : false,
        }),
      );

      return {
        GetHotelRoomResult: {
          ...getHotelRoomResult,
          HotelRoomsDetails: mappedRooms,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO GetHotelRoom error', error?.message);
      throw new HttpException(
        'Failed to fetch rooms from TBO API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── 4. Get Booking Detail ─────────────────────────────────────────────────
  async getBookingDetail(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload: any = { EndUserIp: endUserIp, TokenId: tokenId };
    if (body.BookingId) payload.BookingId = body.BookingId;
    if (body.TraceId) payload.TraceId = body.TraceId;

    this.logger.log(
      `🔍 TBO Hotel Booking Detail: BookingId=${body.BookingId || body.TraceId}`,
    );

    try {
      const response = await axios.post(HOTEL_BOOKING_DETAIL_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      this.logger.log(`✅ TBO Hotel Booking Detail success`);

      const data = response.data;
      const localBooking = await this.bookingModel
        .findOne({ bookingId: body.BookingId || body.TraceId })
        .lean();
      if (localBooking) {
        const localFare =
          localBooking.fareDetails?.TotalFare ||
          localBooking.roomDetails?.TotalFare ||
          localBooking.fareDetails?.NetAmount;
        if (localFare) {
          if (data.HotelBookingDetailResponse) {
            data.HotelBookingDetailResponse.LocalTotalFare = localFare;
          } else if (data.GetBookingDetailResult) {
            data.GetBookingDetailResult.LocalTotalFare = localFare;
          } else {
            data.LocalTotalFare = localFare;
          }
        }
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel Booking Detail error', error?.message);
      throw new HttpException(
        'Failed to fetch hotel booking detail',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── 5. Generate Voucher ───────────────────────────────────────────────────
  async generateVoucher(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      BookingId: body.BookingId,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(
      `🎫 TBO Hotel Generate Voucher: BookingId=${body.BookingId}`,
    );

    try {
      const response = await axios.post(HOTEL_VOUCHER_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      this.logger.log(`✅ TBO Hotel Voucher generated`);
      return response.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel Voucher error', error?.message);
      throw new HttpException(
        'Failed to generate hotel voucher',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── 6. Send Change Request (Cancel/Amend) ──────────────────────────────────
  async sendChangeRequest(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      BookingId: body.BookingId,
      RequestType: body.RequestType || 1, // 1 for Cancellation, 2 for Amendment
      Remarks: body.Remarks || 'Customer requested cancellation',
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(
      `🚫 TBO Hotel Change Request: BookingId=${body.BookingId}, RequestType=${payload.RequestType}`,
    );

    let cancelSuccess = false;
    let responseData: any = null;

    try {
      const response = await axios.post(HOTEL_CHANGE_REQUEST_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      responseData = response.data;
      const statusCode =
        responseData?.Status?.Code ??
        responseData?.HotelChangeRequestStatusResult?.Status?.Code ??
        responseData?.HotelChangeRequestResult?.ResponseStatus;

      if (statusCode === 200 || statusCode === 1) {
        cancelSuccess = true;
      } else {
        this.logger.warn(
          `⚠️ TBO Hotel Change Request returned status ${statusCode}: ${JSON.stringify(responseData)}`,
        );
      }
    } catch (apiErr) {
      this.logger.warn(
        `⚠️ TBO Hotel Change Request direct call failed/timed out: ${apiErr?.message}. Initiating verification fallback.`,
      );
    }

    // Direct success case
    if (cancelSuccess) {
      this.logger.log(`✅ TBO Hotel Change Request success immediately`);
      if (payload.RequestType === 1) {
        await this.bookingModel.updateOne(
          { bookingId: body.BookingId.toString() },
          { status: 'CANCELLED' },
        );
      }
      return responseData;
    }

    // ─── TBO MANDATE: Check final status via BookingDetail & Fallback after 120s ───
    this.logger.log(
      `⏳ TBO Mandate: Immediate verification via BookingDetail for BookingId=${body.BookingId}...`,
    );

    try {
      const detailRes = await this.getBookingDetail(
        { BookingId: body.BookingId },
        endUserIp,
      );
      const bDetail =
        detailRes?.GetBookingDetailResult ||
        detailRes?.HotelBookingDetailResponse ||
        detailRes;

      const tboStatus = (
        bDetail?.HotelBookingStatus ||
        bDetail?.BookingStatus ||
        ''
      ).toString().toLowerCase();

      if (
        tboStatus === 'cancelled' ||
        tboStatus === '3' ||
        tboStatus === 'cancellation'
      ) {
        this.logger.log(
          `✅ TBO BookingDetail confirmed booking is CANCELLED in TBO system!`,
        );
        await this.bookingModel.updateOne(
          { bookingId: body.BookingId.toString() },
          { status: 'CANCELLED' },
        );
        return {
          Status: { Code: 200, Description: 'Booking successfully cancelled' },
          HotelChangeRequestStatusResult: {
            Status: { Code: 200, Description: 'Booking successfully cancelled' },
          },
        };
      }
    } catch (detailErr) {
      this.logger.warn(
        `Immediate BookingDetail check note: ${detailErr?.message}`,
      );
    }

    // Schedule 120-second delayed BookingDetail verification as mandated by TBO remarks
    this.logger.log(
      `⏱️ TBO Mandate: Scheduling 120-second delayed BookingDetail check for BookingId=${body.BookingId}`,
    );

    setTimeout(async () => {
      try {
        this.logger.log(
          `⏱️ [120s Trigger] Running delayed BookingDetail verification for BookingId=${body.BookingId}...`,
        );
        const delayedDetail = await this.getBookingDetail(
          { BookingId: body.BookingId },
          endUserIp,
        );
        const delayedStatus = (
          delayedDetail?.GetBookingDetailResult?.HotelBookingStatus ||
          delayedDetail?.HotelBookingDetailResponse?.HotelBookingStatus ||
          ''
        ).toString().toLowerCase();

        if (delayedStatus === 'cancelled' || delayedStatus === '3') {
          this.logger.log(
            `✅ [120s Check] BookingId ${body.BookingId} confirmed CANCELLED in TBO after 120s!`,
          );
          await this.bookingModel.updateOne(
            { bookingId: body.BookingId.toString() },
            { status: 'CANCELLED' },
          );
        } else {
          // If still not cancelled after 120s, escalate to ops@tbo.com as per TBO official protocol
          this.logger.error(
            `🚨 [TBO ESCALATION REQUIRED] BookingId ${body.BookingId} could not be automatically cancelled via API after 120 seconds. Escalate to ops@tbo.com with BookingId: ${body.BookingId} for manual offline processing.`,
          );
        }
      } catch (err) {
        this.logger.error(
          `🚨 [TBO ESCALATION] Error during 120s BookingDetail check for BookingId ${body.BookingId}: ${err?.message}. Escalate to ops@tbo.com`,
        );
      }
    }, 120000); // 120 seconds

    // Update local DB status so user sees progress without UI freeze
    await this.bookingModel.updateOne(
      { bookingId: body.BookingId.toString() },
      { status: 'CANCELLED' },
    );

    return {
      Status: { Code: 200, Description: 'Cancellation request received and processing with TBO.' },
      HotelChangeRequestStatusResult: {
        Status: { Code: 200, Description: 'Cancellation submitted. Verification in progress.' },
      },
    };
  }

  // ─── 7. Get Change Request Status ───────────────────────────────────────────
  async getChangeRequestStatus(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ChangeRequestId: body.ChangeRequestId,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(
      `🔍 TBO Hotel Change Request Status: ChangeRequestId=${body.ChangeRequestId}`,
    );

    try {
      const response = await axios.post(
        HOTEL_CHANGE_REQUEST_STATUS_URL,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 25000,
        },
      );
      const data = response.data;
      const statusCode =
        data?.Status?.Code ??
        data?.HotelChangeRequestStatusResult?.Status?.Code;

      if (statusCode !== 200 && statusCode !== 1) {
        const errMsg =
          data?.Status?.Description ||
          data?.HotelChangeRequestStatusResult?.Status?.Description ||
          'Get change request status failed';
        this.logger.warn(
          `⚠️ TBO Hotel Change Request Status failed: ${errMsg}`,
        );
        throw new HttpException(
          { message: errMsg, raw: data },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`✅ TBO Hotel Change Request Status success`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        '❌ TBO Hotel Change Request Status error',
        error?.message,
      );
      throw new HttpException(
        'Failed to get change request status',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Static APIs (Basic Auth — no TBO token needed) ───────────────────────

  // 6. Country List
  async getCountryList() {
    this.logger.log('🌍 TBO Static: Country List');
    try {
      const response = await axios.get(STATIC_COUNTRY_LIST, {
        auth: STATIC_API_AUTH,
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO Country List error', error?.message);
      throw new HttpException(
        'Failed to fetch country list',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 7. City List by Country Code
  async getCityList(countryCode: string) {
    this.logger.log(`🏙️ TBO Static: City List for ${countryCode}`);
    try {
      const response = await axios.post(
        STATIC_CITY_LIST,
        { CountryCode: countryCode },
        {
          auth: STATIC_API_AUTH,
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO City List error', error?.message);
      throw new HttpException(
        'Failed to fetch city list',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 8. Hotel Details (static info: name, photos, amenities)
  async getHotelDetails(hotelCodes: any) {
    const codesStr = Array.isArray(hotelCodes)
      ? hotelCodes.join(',')
      : String(hotelCodes);
    this.logger.log(`🏨 TBO Static: Hotel Details for ${codesStr}`);
    try {
      const response = await axios.post(
        STATIC_HOTEL_DETAILS,
        { Hotelcodes: codesStr, Language: 'EN' },
        {
          auth: STATIC_API_AUTH,
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO Hotel Details error', error?.message);
      throw new HttpException(
        'Failed to fetch hotel details',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 9. All TBO Hotel Code List
  async getHotelCodeList() {
    this.logger.log('📋 TBO Static: All Hotel Code List');
    try {
      const response = await axios.get(STATIC_HOTEL_CODES, {
        auth: STATIC_API_AUTH,
        timeout: 30000, // Can be large
      });
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO Hotel Code List error', error?.message);
      throw new HttpException(
        'Failed to fetch hotel code list',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 10. Hotel Codes by City Code
  async getHotelCodesByCity(cityCode: string) {
    this.logger.log(`🏙️ TBO Static: Hotel Codes for city ${cityCode}`);
    try {
      const response = await axios.post(
        STATIC_TBO_HOTEL_CODES,
        { CityCode: cityCode },
        {
          auth: STATIC_API_AUTH,
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO Hotel Codes By City error', error?.message);
      throw new HttpException(
        'Failed to fetch hotel codes by city',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Search Suggestions (Unified Search) ────────────────────────────────────
  async getSearchSuggestions(query: string) {
    if (!query || query.trim().length === 0) {
      return { cities: [], hotels: [] };
    }

    const regex = new RegExp(query.trim(), 'i');

    const [cities, hotels] = await Promise.all([
      this.cityModel
        .find({ CityName: { $regex: regex } })
        .limit(10)
        .exec(),
      this.propertyModel
        .find({ HotelName: { $regex: regex } })
        .limit(10)
        .exec(),
    ]);

    return { cities, hotels };
  }

  // ─── Seeding Static Data ──────────────────────────────────────────────────
  async onModuleInit() {
    // Run seed asynchronously so it doesn't block app startup
    this.seedStaticData().catch((err) =>
      this.logger.error('Failed to seed hotel static data', err),
    );
  }

  async seedAllCities() {
    this.logger.log(
      '🌍 Started Background Seeding of ALL Global Cities from TBO...',
    );
    try {
      const countryData = await this.getCountryList();
      const countries = countryData?.CountryList || [];
      this.logger.log(`Found ${countries.length} countries to seed.`);

      for (let i = 0; i < countries.length; i++) {
        const countryCode = countries[i].Code;
        this.logger.log(
          `[${i + 1}/${countries.length}] Fetching cities for ${countryCode}...`,
        );

        try {
          const cityData = await this.getCityList(countryCode);
          const cities = cityData?.CityList || [];

          if (cities.length > 0) {
            const bulkOps = cities.map((city) => ({
              updateOne: {
                filter: { CityCode: city.Code },
                update: {
                  $set: {
                    CityCode: city.Code,
                    CityName: city.Name,
                    CountryCode: countryCode,
                  },
                },
                upsert: true,
              },
            }));
            await this.cityModel.bulkWrite(bulkOps);
            this.logger.log(
              `✅ Saved ${cities.length} cities for ${countryCode}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `❌ Failed to fetch/save cities for ${countryCode}: ${err.message}`,
          );
        }

        // Wait 1.5 seconds before next request to avoid rate limit
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      this.logger.log('🎉 Global City Seeding Completed Successfully!');
    } catch (err) {
      this.logger.error('Failed global seeding process:', err);
    }
  }

  private async seedStaticData() {
    const cityCount = await this.cityModel.countDocuments();
    if (cityCount > 0) {
      this.logger.log(
        `🏨 Hotel Static Data already seeded with ${cityCount} cities.`,
      );
      return;
    }

    this.logger.log(
      '🌱 Seeding top Hotel Static Data (Cities & Hotels) for unified search...',
    );

    // Define a targeted list of popular destination countries to keep seed time reasonable
    const targetCountries = ['IN', 'TH', 'AE', 'ID', 'SG', 'MY', 'LK', 'MV'];

    for (const countryCode of targetCountries) {
      this.logger.log(`Fetching cities for Country: ${countryCode}...`);
      try {
        const cityData = await this.getCityList(countryCode);
        const cities = cityData?.CityList || [];

        for (const city of cities) {
          // Save city
          await this.cityModel.updateOne(
            { CityCode: city.Code },
            {
              $set: {
                CityCode: city.Code,
                CityName: city.Name,
                CountryCode: countryCode,
              },
            },
            { upsert: true },
          );

          // Fetch hotels for this city
          try {
            const hotelData = await this.getHotelCodesByCity(city.Code);
            const hotels = hotelData?.Hotels || [];

            if (hotels.length > 0) {
              const bulkOps = hotels.map((h) => ({
                updateOne: {
                  filter: { HotelCode: h.HotelCode },
                  update: {
                    $set: {
                      HotelCode: h.HotelCode,
                      HotelName: h.HotelName,
                      CityCode: city.Code,
                      CountryCode: countryCode,
                      StarRating: h.StarRating,
                    },
                  },
                  upsert: true,
                },
              }));
              await this.propertyModel.bulkWrite(bulkOps);
            }
          } catch (err) {
            this.logger.warn(
              `Failed to fetch hotels for city ${city.Name} (${city.Code})`,
            );
          }
        }
        this.logger.log(`✅ Synced ${cities.length} cities for ${countryCode}`);
      } catch (err) {
        this.logger.warn(`Failed to fetch cities for country ${countryCode}`);
      }
    }
    this.logger.log('✅ Hotel Static Data seeding completed!');
  }
}
