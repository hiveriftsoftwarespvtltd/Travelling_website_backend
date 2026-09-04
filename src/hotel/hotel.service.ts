import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as fs from 'fs';
import { HotelCity, HotelCityDocument } from './schemas/hotel-city.schema';
import { HotelProperty, HotelPropertyDocument } from './schemas/hotel-property.schema';
import { HotelBooking, HotelBookingDocument } from './schemas/hotel-booking.schema';

// ─── TBO Shared Auth (same as flight module) ────────────────────────────────
const AUTH_URL = 'http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate';

// ─── TBO Hotel API Endpoints ─────────────────────────────────────────────────
// Affiliate (Search + PreBook) — no TokenId in body, use Basic Auth from JiyoLife credentials
const HOTEL_SEARCH_URL    = 'https://affiliate.tektravels.com/HotelAPI/Search';
const HOTEL_PREBOOK_URL   = 'https://affiliate.tektravels.com/HotelAPI/PreBook';
// B2B (Book, GetBookingDetail, GenerateVoucher, SendChangeRequest) — require TokenId in body
const HOTEL_BOOK_URL      = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/Book';
const HOTEL_BOOKING_DETAIL_URL = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetBookingDetail';
const HOTEL_VOUCHER_URL   = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GenerateVoucher';
const HOTEL_CHANGE_REQUEST_URL = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/SendChangeRequest';
const HOTEL_CHANGE_REQUEST_STATUS_URL = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetChangeRequestStatus';
const HOTEL_ROOMS_URL     = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetHotelRoom';

// Static / Content APIs (Basic Auth — no token needed)
const STATIC_BASE_URL       = 'http://api.tbotechnology.in/TBOHolidays_HotelAPI';
const STATIC_COUNTRY_LIST   = `${STATIC_BASE_URL}/CountryList`;
const STATIC_CITY_LIST      = `${STATIC_BASE_URL}/CityList`;
const STATIC_HOTEL_DETAILS  = `${STATIC_BASE_URL}/Hoteldetails`;
const STATIC_HOTEL_CODES    = `${STATIC_BASE_URL}/hotelcodelist`;
const STATIC_TBO_HOTEL_CODES = `${STATIC_BASE_URL}/TBOHotelCodeList`;

// ─── TBO Credentials ─────────────────────────────────────────────────────────
// B2B Auth credentials (used for Authenticate → TokenId flow)
const AUTH_CREDENTIALS = {
  ClientId: 'ApiIntegrationNew',
  UserName: 'Lifejiyo',
  Password: 'Lifejiyo@123',
};

// Affiliate API uses Basic Auth with JiyoLife credentials
const AFFILIATE_AUTH = {
  username: 'Lifejiyo',
  password: 'Lifejiyo@123',
};

// Static API uses Basic Auth with TBO test credentials
const STATIC_API_AUTH = {
  username: 'TBOStaticAPITest',
  password: 'Tbo@11530818',
};

// ─── TBO Error Codes ──────────────────────────────────────────────────────────
const TBO_ERROR_TOKEN_EXPIRED = 6;
const TBO_ERROR_INVALID_TOKEN  = 7;

import { PaymentService } from '../payment/payment.service';

@Injectable()
export class HotelService implements OnModuleInit {
  private readonly logger = new Logger(HotelService.name);

  constructor(
    @InjectModel(HotelCity.name) private cityModel: Model<HotelCityDocument>,
    @InjectModel(HotelProperty.name) private propertyModel: Model<HotelPropertyDocument>,
    @InjectModel(HotelBooking.name) private bookingModel: Model<HotelBookingDocument>,
    private paymentService: PaymentService,
  ) {}

  // In-memory token cache (shared auth, same as flights)
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  // ─── Auth Token ────────────────────────────────────────────────────────────
  private async getToken(endUserIp: string): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      this.logger.log(`✅ Using cached TBO token (expires in ${Math.round((this.tokenExpiry - now) / 60000)} min)`);
      return this.cachedToken as string;
    }

    this.logger.log(`🔐 Fetching new TBO auth token for Hotel API | IP: ${endUserIp}`);
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
      this.tokenExpiry = now + 3 * 60 * 60 * 1000; // Cache 3 hours
      this.logger.log(`✅ TBO Hotel Token obtained`);
      return this.cachedToken as string;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to authenticate with TBO Hotel API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Helper: Clear token on expiry ────────────────────────────────────────
  private clearToken() {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  // ─── 1. Search Hotels ──────────────────────────────────────────────────────
  // POST https://affiliate.tektravels.com/HotelAPI/Search
  // Affiliate API — uses Basic Auth (JiyoLife credentials), NO TokenId in body
  // Request: { CheckIn, CheckOut (YYYY-MM-DD), HotelCodes, GuestNationality,
  //            PaxRooms:[{Adults,Children,ChildrenAges}], ResponseTime, IsDetailedResponse, Filters }
  // Response: { Status:{Code:200}, HotelResult:[{HotelCode, Currency, Rooms:[{Name[],BookingCode,Inclusion,DayRates,TotalFare,TotalTax,CancelPolicies,MealType,IsRefundable}]}] }
  // ──────────────────────────────────────────────────────────────────────────
  async searchHotels(body: any, endUserIp: string) {
    const sanitizedPaxRooms = (body.PaxRooms || [{ Adults: 1, Children: 0 }]).map(room => {
      const sanitizedRoom: any = { Adults: room.Adults || 1, Children: room.Children || 0 };
      if (sanitizedRoom.Children > 0 && Array.isArray(room.ChildrenAges)) {
        sanitizedRoom.ChildrenAges = room.ChildrenAges;
      } else {
        sanitizedRoom.ChildrenAges = [];
      }
      return sanitizedRoom;
    });

    // Affiliate API payload — dates in YYYY-MM-DD format directly
    const payload: any = {
      CheckIn: body.CheckIn,   // YYYY-MM-DD
      CheckOut: body.CheckOut, // YYYY-MM-DD
      GuestNationality: body.GuestNationality || 'IN',
      PaxRooms: sanitizedPaxRooms,
      ResponseTime: 23.0,
      IsDetailedResponse: true,
      Filters: {
        Refundable: false,
        NoOfRooms: sanitizedPaxRooms.length,
        MealType: 'All',
        StarRating: 'All',
      },
    };

    // HotelCodes filter (comma-separated string)
    if (body.HotelCodes) {
      payload.HotelCodes = body.HotelCodes;
    } else if (body.CityCode || body.CityId) {
      // Affiliate API requires HotelCodes. Fetch codes for the city and pass up to 150
      const cityId = String(body.CityCode || body.CityId);
      try {
        const hotelCodesRes = await this.getHotelCodesByCity(cityId);
        
        if (hotelCodesRes?.Status?.Code && hotelCodesRes.Status.Code !== 200) {
           throw new HttpException(`TBO Static Error: ${hotelCodesRes.Status.Description}`, HttpStatus.BAD_REQUEST);
        }

        const hotels = hotelCodesRes?.Hotels || [];
        if (hotels.length > 0) {
          payload.HotelCodes = hotels.slice(0, 150).map((h: any) => h.HotelCode).join(',');
        } else {
          fs.appendFileSync('search_debug.log', `[${new Date().toISOString()}] No hotels found in city ${cityId}\nBody: ${JSON.stringify(body)}\nAPI Response: ${JSON.stringify(hotelCodesRes)}\n\n`);
          throw new HttpException('No hotels found in the given city', HttpStatus.BAD_REQUEST);
        }
      } catch (err) {
        if (err instanceof HttpException) throw err;
        this.logger.warn(`Failed to fetch hotel codes for city ${cityId}`);
        throw new HttpException('Failed to resolve hotels for this city', HttpStatus.BAD_REQUEST);
      }
    } else {
      throw new HttpException('Either HotelCodes or CityCode is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`🏨 Affiliate Hotel Search: CheckIn=${payload.CheckIn} CheckOut=${payload.CheckOut} HotelCodes=${payload.HotelCodes ? payload.HotelCodes.substring(0, 50) + '...' : 'none'}`);

    try {
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
        fs.appendFileSync('search_debug.log', `[${new Date().toISOString()}] Affiliate Search Failed: ${errMsg}\nPayload: ${JSON.stringify(payload)}\nResponse: ${JSON.stringify(data)}\n\n`);
        return {
          Status: data?.Status || { Code: 400, Description: errMsg },
          HotelResult: []
        };
      }

      const count = data?.HotelResult?.length ?? 0;
      this.logger.log(`✅ Affiliate Hotel Search found ${count} hotels`);

      // ─── Augment with Static Data (HotelName, Image, Rating, etc.) ────────
      if (count > 0) {
        try {
          // Take first 150 hotels to avoid overly massive static API requests
          const hotelCodesToFetch = data.HotelResult.slice(0, 150).map((h: any) => h.HotelCode).join(',');
          const staticDataRes = await this.getHotelDetails(hotelCodesToFetch);
          
          if (staticDataRes?.HotelDetails) {
            const staticMap = new Map();
            staticDataRes.HotelDetails.forEach((sd: any) => {
              staticMap.set(String(sd.HotelCode), sd);
            });

            data.HotelResult = data.HotelResult.map((h: any) => {
              const staticInfo = staticMap.get(String(h.HotelCode));
              if (staticInfo) {
                return {
                  ...h,
                  HotelName: staticInfo.HotelName,
                  HotelPicture: staticInfo.Image || staticInfo.HotelPicture || h.HotelPicture,
                  HotelRating: staticInfo.StarRating || staticInfo.HotelRating || h.HotelRating || h.StarRating,
                  HotelAddress: staticInfo.Address || h.HotelAddress,
                  HotelFacilities: staticInfo.HotelFacilities,
                };
              }
              return h;
            });
            this.logger.log(`✅ Augmented search results with static data`);
          }
        } catch (e) {
          this.logger.warn(`⚠️ Failed to augment static data for search results: ${e.message}`);
        }
      }

      // Return Affiliate response directly — frontend will handle HotelResult[] format
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ Affiliate Hotel Search error', error?.message);
      throw new HttpException('Failed to search hotels from TBO Affiliate API', HttpStatus.BAD_GATEWAY);
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
      throw new HttpException('BookingCode is required for PreBook', HttpStatus.BAD_REQUEST);
    }

    // Affiliate PreBook payload — only BookingCode + PaymentMode
    const payload = {
      BookingCode: body.BookingCode,
      PaymentMode: 'Limit',
    };

    this.logger.log(`🛎️ Affiliate Hotel PreBook: BookingCode=${payload.BookingCode}`);

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
        throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`✅ Affiliate Hotel PreBook success`);

      // Return Affiliate response directly — frontend will parse HotelResult[0].Rooms[0].NetAmount etc.
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ Affiliate Hotel PreBook error', error?.message);
      throw new HttpException('Failed to pre-book hotel with TBO Affiliate API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── 3. Book Hotel ─────────────────────────────────────────────────────────
  // POST https://HotelBE.tektravels.com/hotelservice.svc/rest/book
  // BookingCode from Affiliate PreBook must be at ROOT level (not inside HotelRoomsDetails)
  // NetAmount from Affiliate PreBook response (HotelResult[0].Rooms[0].NetAmount)
  // ──────────────────────────────────────────────────────────────────────────
  async bookHotel(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);
    const clientRef = body.ClientReferenceNumber || `REF-${Date.now()}`;

    const payload = {
      BookingCode: body.BookingCode,  // ← CRITICAL: must be at root level for Affiliate BookingCodes
      ClientReferenceNo: Math.floor(Date.now() / 1000), // MUST BE INT32
      IsVoucherBooking: body.IsVoucherBooking ?? true,
      GuestNationality: body.GuestNationality || 'IN',
      EndUserIp: endUserIp,
      TokenId: tokenId,
      RequestedBookingMode: body.RequestedBookingMode || 5,
      NetAmount: body.NetAmount || 0, // NetAmount from Affiliate PreBook response
      ClientReferenceId: clientRef,
      ...(body.IsCorporate ? { IsCorporate: true } : {}),
      ...(body.IsPackageFare ? { IsPackageFare: true } : {}),
      ...(body.ArrivalTransport ? { ArrivalTransport: body.ArrivalTransport } : {}),
      ...(body.DepartureTransport ? { DepartureTransport: body.DepartureTransport } : {}),
      HotelRoomsDetails: (body.HotelRoomsDetails || []).map(r => ({
        RoomIndex: r.RoomIndex,
        RoomTypeCode: r.RoomTypeCode,
        RoomTypeName: r.RoomTypeName,
        RatePlanCode: r.RatePlanCode,
        BedTypeCode: r.BedTypeCode || null,
        SmokingPreference: r.SmokingPreference || 0,
        Supplements: r.Supplements || null,
        Price: r.Price,
        HotelPassenger: (r.HotelPassenger || []).map(p => ({
          Title: p.Title || 'Mr',
          FirstName: typeof p.FirstName === 'string' ? p.FirstName.trim() : p.FirstName,
          MiddleName: p.MiddleName || '',
          LastName: typeof p.LastName === 'string' ? p.LastName.trim() : p.LastName,
          PaxType: p.PaxType || 1,
          LeadPassenger: p.LeadPassenger || false,
          Age: p.Age || 30,
          Email: typeof p.Email === 'string' ? p.Email.trim() : (p.Email || 'guest@example.com'),
          Phoneno: p.Phoneno ? p.Phoneno.replace(/\D/g, '').substring(0, 15) : '9999999999',
          PaxId: p.PaxId || 1,
          GSTCompanyAddress: p.GSTCompanyAddress || null,
          GSTCompanyContactNumber: p.GSTCompanyContactNumber || null,
          GSTCompanyName: p.GSTCompanyName || null,
          GSTNumber: p.GSTNumber || null,
          GSTCompanyEmail: p.GSTCompanyEmail || null,
          PAN: p.PAN || null,
          PassportNo: p.PassportNo || null,
          PassportIssueDate: p.PassportIssueDate || null,
          PassportExpDate: p.PassportExpDate || null,
        }))
      })),
    };

    // 1. Create DB Record (Initial State: BOOKING_IN_PROGRESS)
    const bookingRecord = new this.bookingModel({
      bookingId: 'PENDING',
      clientReferenceNo: clientRef,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      status: 'BOOKING_IN_PROGRESS',
      hotelDetails: body.hotelDetails || {}, 
      roomDetails: body.roomDetails || {}, 
      guestDetails: body.HotelRoomsDetails, 
      fareDetails: { NetAmount: body.NetAmount },
      endUserIp,
      userId: body.userId || '',
      email: body.email || '',
      traceId: body.TraceId,
      apiLogs: { request: payload },
    });
    await bookingRecord.save();

    this.logger.log(`📋 TBO Hotel Book: BookingCode=${body.BookingCode} TraceId=${body.TraceId} HotelCode=${body.HotelCode}`);
    this.logger.log(`FULL BOOK PAYLOAD: ${JSON.stringify(payload)}`);

    try {
      const response = await axios.post(HOTEL_BOOK_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      const data = response.data;
      const bookResult = data?.BookResult || data;
      const statusCode = bookResult?.Status?.Code ?? data?.Status?.Code;

      bookingRecord.apiLogs.response = data;

      if (statusCode !== 200 && statusCode !== 1 && !bookResult?.BookingId) {
        const errMsg = bookResult?.Error?.ErrorMessage || bookResult?.Status?.Description || data?.Status?.Description || 'Hotel booking failed';
        this.logger.error(`❌ TBO Hotel Book failed: ${errMsg}`);
        
        bookingRecord.status = 'FAILED';
        bookingRecord.apiLogs.error = errMsg;

        // Auto Refund if payment ID is present
        if (bookingRecord.razorpayPaymentId) {
          const refundRes = await this.paymentService.processRefund(bookingRecord.razorpayPaymentId, bookingRecord.fareDetails.NetAmount, { reason: 'TBO Hotel booking failed' });
          if (refundRes.success) {
            bookingRecord.status = 'REFUND_INITIATED';
          }
        }
        bookingRecord.markModified('apiLogs');
        await bookingRecord.save();

        throw new HttpException(
          { message: errMsg, details: data },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`✅ TBO Hotel Book success! BookingId: ${bookResult?.BookingId}`);
      
      bookingRecord.bookingId = bookResult?.BookingId?.toString() || 'UNKNOWN';
      bookingRecord.confirmationNo = bookResult?.ConfirmationNo;
      bookingRecord.status = statusCode === 1 ? 'CONFIRMED' : 'PENDING_CONFIRMATION';
      await bookingRecord.save();

      // Trigger Voucher Generation Asynchronously
      if (bookingRecord.status === 'CONFIRMED' && bookResult?.BookingId) {
        this.generateVoucherAsync(bookResult.BookingId, endUserIp, bookingRecord._id.toString());
      }

      return data;
    } catch (error) {
      bookingRecord.status = 'FAILED';
      bookingRecord.apiLogs = bookingRecord.apiLogs || {};
      bookingRecord.apiLogs.error = error?.response?.data || error?.message;

      // Auto Refund if payment ID is present
      if (bookingRecord.razorpayPaymentId && bookingRecord.status !== 'REFUND_INITIATED') {
        const refundRes = await this.paymentService.processRefund(bookingRecord.razorpayPaymentId, bookingRecord.fareDetails.NetAmount, { reason: 'TBO Hotel booking failed' });
        if (refundRes.success) {
          bookingRecord.status = 'REFUND_INITIATED';
        }
      }
      bookingRecord.markModified('apiLogs');
      await bookingRecord.save();

      if (error instanceof HttpException) throw error;
      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Hotel Book API error: ' + JSON.stringify(responseData));
      throw new HttpException(
        { message: 'Hotel booking failed. Please try again.', details: responseData },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ─── Internal Helper: Generate Voucher Async ────────────────────────────────
  private async generateVoucherAsync(bookingId: number, endUserIp: string, recordId: string) {
    try {
      this.logger.log(`🔄 Triggering async voucher generation for BookingId: ${bookingId}`);
      const data = await this.generateVoucher({ BookingId: bookingId }, endUserIp);
      
      const voucherData = data?.GenerateVoucherResult || data;
      if (voucherData) {
        await this.bookingModel.findByIdAndUpdate(recordId, {
          $set: {
            'voucherDetails': voucherData,
            'confirmationNo': voucherData?.Voucher?.ConfirmationNo || 'Pending'
          }
        });
        this.logger.log(`✅ Async voucher saved for BookingId: ${bookingId}`);
      }
    } catch (err) {
      this.logger.error(`❌ Async voucher generation failed for BookingId: ${bookingId}`, err?.message);
    }
  }

  // ─── Get My Bookings ────────────────────────────────────────────────────────
  async getMyBookings(userId?: string) {
    // Only filter by userId — email/phone fallback removed to prevent cross-user data leaks
    if (!userId) {
      return [];
    }

    const bookings = await this.bookingModel.find({ userId }).sort({ createdAt: -1 }).exec();
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

    this.logger.log(`🛎️ TBO GetHotelRoom: HotelCode=${payload.HotelCode} TraceId=${payload.TraceId} ResultIndex=${payload.ResultIndex}`);

    try {
      const response = await axios.post(HOTEL_ROOMS_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const data = response.data;
      const getHotelRoomResult = data?.GetHotelRoomResult;
      
      if (!getHotelRoomResult || getHotelRoomResult.ResponseStatus !== 1) {
        const errMsg = getHotelRoomResult?.Error?.ErrorMessage || 'Failed to fetch room details';
        this.logger.warn(`⚠️ TBO GetHotelRoom: ${errMsg}`);
        if (errMsg.toLowerCase().includes('token')) {
          this.clearToken();
          return this.getHotelRooms(body, endUserIp);
        }
        throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
      }

      // Map B2B room pricing fields to what frontend expects
      const mappedRooms = (getHotelRoomResult.HotelRoomsDetails || []).map(r => ({
        ...r,
        TotalFare: r.Price?.PublishedPrice ?? 0,
        IsRefundable: r.LastCancellationDate ? new Date(r.LastCancellationDate) > new Date() : false
      }));

      return {
        GetHotelRoomResult: {
          ...getHotelRoomResult,
          HotelRoomsDetails: mappedRooms
        }
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO GetHotelRoom error', error?.message);
      throw new HttpException('Failed to fetch rooms from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── 4. Get Booking Detail ─────────────────────────────────────────────────
  async getBookingDetail(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload: any = { EndUserIp: endUserIp, TokenId: tokenId };
    if (body.BookingId) payload.BookingId = body.BookingId;
    if (body.TraceId)   payload.TraceId   = body.TraceId;

    this.logger.log(`🔍 TBO Hotel Booking Detail: BookingId=${body.BookingId || body.TraceId}`);

    try {
      const response = await axios.post(HOTEL_BOOKING_DETAIL_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      this.logger.log(`✅ TBO Hotel Booking Detail success`);
      return response.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel Booking Detail error', error?.message);
      throw new HttpException('Failed to fetch hotel booking detail', HttpStatus.BAD_GATEWAY);
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

    this.logger.log(`🎫 TBO Hotel Generate Voucher: BookingId=${body.BookingId}`);

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
      throw new HttpException('Failed to generate hotel voucher', HttpStatus.BAD_GATEWAY);
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

    this.logger.log(`🚫 TBO Hotel Change Request: BookingId=${body.BookingId}, RequestType=${payload.RequestType}`);

    try {
      const response = await axios.post(HOTEL_CHANGE_REQUEST_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      const data = response.data;
      const statusCode = data?.Status?.Code ?? data?.HotelChangeRequestStatusResult?.Status?.Code;
      
      if (statusCode !== 200 && statusCode !== 1) {
        const errMsg = data?.Status?.Description || data?.HotelChangeRequestStatusResult?.Status?.Description || 'Change request failed';
        this.logger.warn(`⚠️ TBO Hotel Change Request failed: ${errMsg}`);
        throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`✅ TBO Hotel Change Request success`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel Change Request error', error?.message);
      throw new HttpException('Failed to send hotel change request', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── 7. Get Change Request Status ───────────────────────────────────────────
  async getChangeRequestStatus(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ChangeRequestId: body.ChangeRequestId,
      EndUserIp: endUserIp,
      TokenId: tokenId,
    };

    this.logger.log(`🔍 TBO Hotel Change Request Status: ChangeRequestId=${body.ChangeRequestId}`);

    try {
      const response = await axios.post(HOTEL_CHANGE_REQUEST_STATUS_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      const data = response.data;
      const statusCode = data?.Status?.Code ?? data?.HotelChangeRequestStatusResult?.Status?.Code;
      
      if (statusCode !== 200 && statusCode !== 1) {
        const errMsg = data?.Status?.Description || data?.HotelChangeRequestStatusResult?.Status?.Description || 'Get change request status failed';
        this.logger.warn(`⚠️ TBO Hotel Change Request Status failed: ${errMsg}`);
        throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`✅ TBO Hotel Change Request Status success`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel Change Request Status error', error?.message);
      throw new HttpException('Failed to get change request status', HttpStatus.BAD_GATEWAY);
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
      throw new HttpException('Failed to fetch country list', HttpStatus.BAD_GATEWAY);
    }
  }

  // 7. City List by Country Code
  async getCityList(countryCode: string) {
    this.logger.log(`🏙️ TBO Static: City List for ${countryCode}`);
    try {
      const response = await axios.post(
        STATIC_CITY_LIST,
        { CountryCode: countryCode },
        { auth: STATIC_API_AUTH, headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO City List error', error?.message);
      throw new HttpException('Failed to fetch city list', HttpStatus.BAD_GATEWAY);
    }
  }

  // 8. Hotel Details (static info: name, photos, amenities)
  async getHotelDetails(hotelCodes: any) {
    const codesStr = Array.isArray(hotelCodes) ? hotelCodes.join(',') : String(hotelCodes);
    this.logger.log(`🏨 TBO Static: Hotel Details for ${codesStr}`);
    try {
      const response = await axios.post(
        STATIC_HOTEL_DETAILS,
        { Hotelcodes: codesStr, Language: 'EN' },
        { auth: STATIC_API_AUTH, headers: { 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO Hotel Details error', error?.message);
      throw new HttpException('Failed to fetch hotel details', HttpStatus.BAD_GATEWAY);
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
      throw new HttpException('Failed to fetch hotel code list', HttpStatus.BAD_GATEWAY);
    }
  }

  // 10. Hotel Codes by City Code
  async getHotelCodesByCity(cityCode: string) {
    this.logger.log(`🏙️ TBO Static: Hotel Codes for city ${cityCode}`);
    try {
      const response = await axios.post(
        STATIC_TBO_HOTEL_CODES,
        { CityCode: cityCode },
        { auth: STATIC_API_AUTH, headers: { 'Content-Type': 'application/json' }, timeout: 20000 },
      );
      return response.data;
    } catch (error) {
      this.logger.error('❌ TBO Hotel Codes By City error', error?.message);
      throw new HttpException('Failed to fetch hotel codes by city', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── Search Suggestions (Unified Search) ────────────────────────────────────
  async getSearchSuggestions(query: string) {
    if (!query || query.trim().length === 0) {
      return { cities: [], hotels: [] };
    }

    const regex = new RegExp(query.trim(), 'i');

    const [cities, hotels] = await Promise.all([
      this.cityModel.find({ CityName: { $regex: regex } }).limit(10).exec(),
      this.propertyModel.find({ HotelName: { $regex: regex } }).limit(10).exec(),
    ]);

    return { cities, hotels };
  }

  // ─── Seeding Static Data ──────────────────────────────────────────────────
  async onModuleInit() {
    // Run seed asynchronously so it doesn't block app startup
    this.seedStaticData().catch(err => this.logger.error('Failed to seed hotel static data', err));
  }

  private async seedStaticData() {
    const cityCount = await this.cityModel.countDocuments();
    if (cityCount > 0) {
      this.logger.log(`🏨 Hotel Static Data already seeded with ${cityCount} cities.`);
      return;
    }

    this.logger.log('🌱 Seeding top Hotel Static Data (Cities & Hotels) for unified search...');
    
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
            { $set: { CityCode: city.Code, CityName: city.Name, CountryCode: countryCode } },
            { upsert: true }
          );

          // Fetch hotels for this city
          try {
            const hotelData = await this.getHotelCodesByCity(city.Code);
            const hotels = hotelData?.Hotels || [];
            
            if (hotels.length > 0) {
              const bulkOps = hotels.map(h => ({
                updateOne: {
                  filter: { HotelCode: h.HotelCode },
                  update: {
                    $set: {
                      HotelCode: h.HotelCode,
                      HotelName: h.HotelName,
                      CityCode: city.Code,
                      CountryCode: countryCode,
                      StarRating: h.StarRating,
                    }
                  },
                  upsert: true
                }
              }));
              await this.propertyModel.bulkWrite(bulkOps);
            }
          } catch (err) {
            this.logger.warn(`Failed to fetch hotels for city ${city.Name} (${city.Code})`);
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
