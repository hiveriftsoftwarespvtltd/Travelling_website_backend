import { Controller, Post, Get, Body, Req, Query } from '@nestjs/common';
import { HotelService } from './hotel.service';
import type { Request } from 'express';

@Controller('hotel')
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  private getValidIp(req: Request): string {
    const rawIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139';
    // TBO DB column for IP is narrow — fallback to IPv4 for IPv6 addresses
    if (rawIp.includes(':')) return '103.98.38.139';
    return rawIp;
  }

  // ─── Dynamic / Booking Endpoints ───────────────────────────────────────────

  @Post('search')
  async searchHotels(@Body() body: any, @Req() req: Request) {
    return this.hotelService.searchHotels(body, this.getValidIp(req));
  }

  @Post('rooms')
  async getHotelRooms(@Body() body: any, @Req() req: Request) {
    return this.hotelService.getHotelRooms(body, this.getValidIp(req));
  }

  @Post('pre-book')
  async preBookHotel(@Body() body: any, @Req() req: Request) {
    return this.hotelService.preBookHotel(body, this.getValidIp(req));
  }

  @Post('book')
  async bookHotel(@Body() body: any, @Req() req: Request) {
    return this.hotelService.bookHotel(body, this.getValidIp(req));
  }

  @Post('booking-detail')
  async getBookingDetail(@Body() body: any, @Req() req: Request) {
    return this.hotelService.getBookingDetail(body, this.getValidIp(req));
  }

  @Post('generate-voucher')
  async generateVoucher(@Body() body: any, @Req() req: Request) {
    return this.hotelService.generateVoucher(body, this.getValidIp(req));
  }

  @Post('cancel-booking')
  async cancelBooking(@Body() body: any, @Req() req: Request) {
    return this.hotelService.sendChangeRequest(body, this.getValidIp(req));
  }

  @Get('my-bookings')
  async getMyBookings(@Query('email') email: string, @Query('phone') phone: string) {
    return this.hotelService.getMyBookings(email, phone);
  }

  // ─── Static Data Endpoints ──────────────────────────────────────────────────

  @Get('countries')
  async getCountryList() {
    return this.hotelService.getCountryList();
  }

  @Post('cities')
  async getCityList(@Body() body: { CountryCode: string }) {
    return this.hotelService.getCityList(body.CountryCode);
  }

  @Post('hotel-details')
  async getHotelDetails(@Body() body: { Hotelcodes: number | number[] }) {
    return this.hotelService.getHotelDetails(body.Hotelcodes);
  }

  @Get('hotel-codes')
  async getHotelCodeList() {
    return this.hotelService.getHotelCodeList();
  }

  @Post('hotel-codes-by-city')
  async getHotelCodesByCity(@Body() body: { CityCode: string }) {
    return this.hotelService.getHotelCodesByCity(body.CityCode);
  }

  @Get('search-suggestions')
  async getSearchSuggestions(@Query('q') q: string) {
    return this.hotelService.getSearchSuggestions(q);
  }
}
