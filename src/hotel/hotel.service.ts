import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';

// ─── TBO Shared Auth (same as flight module) ────────────────────────────────
const AUTH_URL = 'http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate';

// ─── TBO Hotel API Endpoints ─────────────────────────────────────────────────
// Dynamic / Booking APIs (require auth token)
const HOTEL_SEARCH_URL    = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetHotelResult';
const HOTEL_PREBOOK_URL   = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/BlockRoom';
const HOTEL_ROOMS_URL     = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GetHotelRoom';
const HOTEL_BOOK_URL      = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/book';
const HOTEL_BOOKING_DETAIL_URL = 'https://hotelbe.tektravels.com/hotelservice.svc/rest/Getbookingdetail';
const HOTEL_VOUCHER_URL   = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/GenerateVoucher';
const HOTEL_CHANGE_REQUEST_URL = 'https://HotelBE.tektravels.com/hotelservice.svc/rest/SendChangeRequest';

// Static / Content APIs (Basic Auth — no token needed)
const STATIC_BASE_URL       = 'http://api.tbotechnology.in/TBOHolidays_HotelAPI';
const STATIC_COUNTRY_LIST   = `${STATIC_BASE_URL}/CountryList`;
const STATIC_CITY_LIST      = `${STATIC_BASE_URL}/CityList`;
const STATIC_HOTEL_DETAILS  = `${STATIC_BASE_URL}/Hoteldetails`;
const STATIC_HOTEL_CODES    = `${STATIC_BASE_URL}/hotelcodelist`;
const STATIC_TBO_HOTEL_CODES = `${STATIC_BASE_URL}/TBOHotelCodeList`;

// ─── TBO Credentials ─────────────────────────────────────────────────────────
const AUTH_CREDENTIALS = {
  ClientId: 'ApiIntegrationNew',
  UserName: 'Lifejiyo',
  Password: 'Lifejiyo@123',
};

// Static API uses Basic Auth
const STATIC_API_AUTH = {
  username: 'TBOStaticAPITest',
  password: 'Tbo@11530818',
};

// ─── TBO Error Codes ──────────────────────────────────────────────────────────
const TBO_ERROR_TOKEN_EXPIRED = 6;
const TBO_ERROR_INVALID_TOKEN  = 7;

@Injectable()
export class HotelService {
  private readonly logger = new Logger(HotelService.name);

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
  // HotelCodes: comma-separated string of hotel codes from TBOHotelCodeList
  // GuestNationality: ISO country code e.g. "IN"
  // PaxRooms: [{Adults, Children, ChildrenAges}]
  // ──────────────────────────────────────────────────────────────────────────
  async searchHotels(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const sanitizedPaxRooms = (body.PaxRooms || [{ Adults: 1, Children: 0 }]).map(room => {
      const sanitizedRoom: any = { Adults: room.Adults || 1, Children: room.Children || 0 };
      if (sanitizedRoom.Children > 0 && Array.isArray(room.ChildrenAges)) {
        sanitizedRoom.ChildrenAges = room.ChildrenAges;
      }
      return sanitizedRoom;
    });

    // Parse dates and compute nights
    let checkInDateStr = body.CheckIn; // Fallback
    let noOfNights = 1;
    try {
      if (body.CheckIn && body.CheckOut) {
        const [year, month, day] = body.CheckIn.split('-');
        checkInDateStr = `${day}/${month}/${year}`;
        const checkInDate = new Date(body.CheckIn);
        const checkOutDate = new Date(body.CheckOut);
        noOfNights = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } catch (e) {
      this.logger.warn(`Failed to parse search dates: CheckIn=${body.CheckIn} CheckOut=${body.CheckOut}`);
    }

    const payload = {
      EndUserIp: endUserIp,
      TokenId: tokenId,
      CheckInDate: checkInDateStr,
      NoOfNights: noOfNights,
      CountryCode: body.CountryCode || 'IN',
      CityId: Number(body.CityCode || body.CityId || 119805),
      GuestNationality: body.GuestNationality || 'IN',
      NoOfRooms: sanitizedPaxRooms.length,
      RoomGuests: sanitizedPaxRooms.map(room => ({
        NoOfAdults: room.Adults || 1,
        NoOfChild: room.Children || 0,
        ChildAge: room.ChildrenAges || null
      })),
      MaxRating: body.MaxRating || 5,
      MinRating: body.MinRating || 0,
      ReviewScore: body.ReviewScore || null,
      IsNearBySearchAllowed: body.IsNearBySearchAllowed !== false,
      HotelCodeList: body.HotelCodes || null,
    };

    this.logger.log(`🏨 TBO Hotel Search: CheckInDate=${payload.CheckInDate} Nights=${payload.NoOfNights} CityId=${payload.CityId} HotelCodes=${body.HotelCodes ? 'Specified' : 'All'}`);

    try {
      const response = await axios.post(HOTEL_SEARCH_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      });

      const data = response.data;
      const searchResult = data?.HotelSearchResult;
      
      if (!searchResult || searchResult.ResponseStatus !== 1) {
        const errMsg = searchResult?.Error?.ErrorMessage || 'Hotel search failed';
        this.logger.warn(`⚠️ TBO Hotel Search: ${errMsg}`);

        // Check for token expiry
        if (errMsg.toLowerCase().includes('token')) {
          this.clearToken();
          return this.searchHotels(body, endUserIp);
        }
        
        return {
          GetHotelResultResponse: {
            ResponseStatus: searchResult?.ResponseStatus || 3,
            Error: searchResult?.Error || { ErrorCode: 3, ErrorMessage: errMsg },
            TraceId: searchResult?.TraceId || null,
            HotelResults: []
          }
        };
      }

      const count = searchResult?.HotelResults?.length ?? 0;
      this.logger.log(`✅ Hotel Search found ${count} hotels`);

      // Map response to the format expected by the frontend
      return {
        GetHotelResultResponse: {
          ResponseStatus: searchResult.ResponseStatus,
          Error: searchResult.Error,
          TraceId: searchResult.TraceId,
          HotelResults: (searchResult.HotelResults || []).map(h => ({
            ...h,
            MinPrice: h.Price?.PublishedPrice ?? h.MinPrice, // fallback to MinPrice
          })),
          CheckInDate: searchResult.CheckInDate,
          CheckOutDate: searchResult.CheckOutDate,
        }
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel Search error', error?.message);
      throw new HttpException('Failed to search hotels from TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── 2. Pre-Book Hotel ─────────────────────────────────────────────────────
  // POST https://affiliate.tektravels.com/HotelAPI/PreBook
  // BookingCode: from Search response (HotelResult.Rooms[0].BookingCode)
  // PaymentMode: "Limit" for credit-limit billing
  // ──────────────────────────────────────────────────────────────────────────
  async preBookHotel(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    // B2B BlockRoom payload expects a HotelBookRequest type
    // If NoOfRooms or HotelRoomsDetails is not provided, we fall back to a single dummy passenger
    const noOfRooms = body.NoOfRooms || 1;
    const roomGuests = body.RoomGuests || [{ NoOfAdults: 2, NoOfChild: 0, ChildAge: null }];

    const dummyPassengerList = Array.from({ length: roomGuests[0]?.NoOfAdults || 2 }, (_, idx) => ({
      Title: 'Mr',
      FirstName: 'Guest',
      LastName: `Lead${idx + 1}`,
      PaxType: idx === 0 ? 1 : 2,
      LeadPassenger: idx === 0,
      Age: 30,
      Email: 'guest@example.com',
      Phoneno: '9999999999',
      CountryCode: 'IN',
      CountryName: 'India'
    }));

    const hotelRoomsDetails = body.HotelRoomsDetails || [
      {
        RoomIndex: Number(body.RoomIndex || 7), // fallback to standard Goa test room RoomIndex 7
        RoomTypeCode: body.RoomTypeCode || '',
        RoomTypeName: body.RoomTypeName || 'Standard Room',
        RatePlanCode: body.BookingCode || '',
        BedTypeCode: null,
        SmokingPreference: 0,
        Supplements: null,
        Price: body.Price || null,
        HotelPassenger: dummyPassengerList
      }
    ];

    const payload = {
      TraceId: body.TraceId,
      ResultIndex: Number(body.ResultIndex || 1),
      HotelCode: body.HotelCode || '',
      BookingCode: body.BookingCode,
      IsVoucherBooking: body.IsVoucherBooking !== false, // default true to avoid cancellation penalty WCF errors
      GuestNationality: body.GuestNationality || 'IN',
      EndUserIp: endUserIp,
      TokenId: tokenId,
      RequestedBookingMode: body.RequestedBookingMode ?? 5,
      NoOfRooms: noOfRooms,
      NetAmount: body.NetAmount || 0,
      HotelRoomsDetails: hotelRoomsDetails,
    };

    this.logger.log(`🛎️ TBO Hotel BlockRoom (PreBook): HotelCode=${payload.HotelCode} TraceId=${payload.TraceId} RoomIndex=${hotelRoomsDetails[0]?.RoomIndex}`);

    try {
      const response = await axios.post(HOTEL_PREBOOK_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      });

      const data = response.data;
      const blockResult = data?.BlockRoomResult;
      
      if (!blockResult || blockResult.ResponseStatus !== 1) {
        const errMsg = blockResult?.Error?.ErrorMessage || 'Hotel pre-book/block failed';
        this.logger.warn(`⚠️ TBO Hotel BlockRoom failed: ${errMsg}`);
        if (errMsg.toLowerCase().includes('token')) {
          this.clearToken();
          return this.preBookHotel(body, endUserIp);
        }
        throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`✅ TBO Hotel BlockRoom (PreBook) success`);
      
      // Map to the shape expected by the frontend
      return {
        PreBookResult: {
          Status: blockResult.Status || { Code: 200, Description: 'Success' },
          HotelResult: {
            HotelCode: blockResult.HotelCode || payload.HotelCode,
            HotelName: blockResult.HotelName,
            Rooms: (blockResult.HotelRoomsDetails || []).map(r => ({
              BookingCode: r.BookingCode || r.RatePlanCode,
              RatePlanCode: r.RatePlanCode,
              RoomTypeCode: r.RoomTypeCode,
              RoomTypeName: r.RoomTypeName,
              RoomIndex: r.RoomIndex,
              Price: r.Price,
              TotalFare: r.Price?.PublishedPrice ?? 0,
              CancellationPolicies: r.CancellationPolicies || []
            }))
          }
        }
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('❌ TBO Hotel PreBook error', error?.message);
      throw new HttpException('Failed to pre-book hotel with TBO API', HttpStatus.BAD_GATEWAY);
    }
  }

  // ─── 3. Book Hotel ─────────────────────────────────────────────────────────
  // POST https://HotelBE.tektravels.com/hotelservice.svc/rest/book
  // Full passenger details required
  // ──────────────────────────────────────────────────────────────────────────
  async bookHotel(body: any, endUserIp: string) {
    const tokenId = await this.getToken(endUserIp);

    const payload = {
      ClientReferenceNumber: body.ClientReferenceNumber || `REF-${Date.now()}`,
      TraceId: body.TraceId, // Add TraceId
      ResultIndex: Number(body.ResultIndex || 1), // Add ResultIndex
      HotelCode: body.HotelCode || '', // Add HotelCode
      BookingCode: body.BookingCode,
      IsVoucherBooking: body.IsVoucherBooking ?? true,
      GuestNationality: body.GuestNationality || 'IN',
      EndUserIp: endUserIp,
      TokenId: tokenId,
      RequestedBookingMode: body.RequestedBookingMode ?? 5,
      NoOfRooms: body.NoOfRooms || body.HotelRoomsDetails?.length || 1, // Add NoOfRooms
      NetAmount: body.NetAmount,
      HotelRoomsDetails: body.HotelRoomsDetails,
    };

    this.logger.log(`📋 TBO Hotel Book: BookingCode=${body.BookingCode} TraceId=${payload.TraceId} HotelCode=${payload.HotelCode}`);

    try {
      const response = await axios.post(HOTEL_BOOK_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      const data = response.data;
      const bookResult = data?.BookResult || data;
      const statusCode = bookResult?.Status?.Code ?? data?.Status?.Code;

      if (statusCode !== 200 && statusCode !== 1 && !bookResult?.BookingId) {
        const errMsg = bookResult?.Error?.ErrorMessage || bookResult?.Status?.Description || data?.Status?.Description || 'Hotel booking failed';
        this.logger.error(`❌ TBO Hotel Book failed: ${errMsg}`);
        throw new HttpException(
          { message: errMsg, details: data },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`✅ TBO Hotel Book success! BookingId: ${bookResult?.BookingId}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const responseData = error?.response?.data || error?.message;
      this.logger.error('❌ TBO Hotel Book API error: ' + JSON.stringify(responseData));
      throw new HttpException(
        { message: 'Hotel booking failed. Please try again.', details: responseData },
        HttpStatus.BAD_GATEWAY,
      );
    }
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
  async getHotelDetails(hotelCodes: number | number[]) {
    this.logger.log(`🏨 TBO Static: Hotel Details for ${hotelCodes}`);
    try {
      const response = await axios.post(
        STATIC_HOTEL_DETAILS,
        { Hotelcodes: hotelCodes, Language: 'EN' },
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
}
