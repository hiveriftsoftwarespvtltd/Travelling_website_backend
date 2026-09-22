import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { FlightService } from './flight.service';
import { FlightSearchDto } from './dto/flight-search.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('flight')
export class FlightController {
  constructor(private readonly flightService: FlightService) {}

  private getValidIp(req: Request): string {
    const rawIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139';
    // TBO sandbox DB column for IP is too small for IPv6. Fallback to IPv4.
    if (rawIp.includes(':')) {
      return '103.98.38.139';
    }
    return rawIp;
  }

  @Post('search')
  async searchFlights(@Body() searchDto: FlightSearchDto, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.searchFlights(searchDto, endUserIp);
  }

  @Post('calendar-fare')
  async getCalendarFare(
    @Body() searchDto: FlightSearchDto,
    @Req() req: Request,
  ) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getCalendarFare(searchDto, endUserIp);
  }

  @Post('update-calendar-fare')
  async updateCalendarFareOfDay(
    @Body() searchDto: FlightSearchDto,
    @Req() req: Request,
  ) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.updateCalendarFareOfDay(searchDto, endUserIp);
  }

  @Post('fare-upsell')
  async getFareUpsell(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getFareUpsell(reqBody, endUserIp);
  }

  @Post('fare-rule')
  async getFareRule(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getFareRule(reqBody, endUserIp);
  }

  @Post('fare-quote')
  async getFareQuote(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getFareQuote(reqBody, endUserIp);
  }

  @Post('ssr')
  async getSSR(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getSSR(reqBody, endUserIp);
  }

  @Post('book')
  @UseGuards(JwtAuthGuard)
  async bookFlight(@Body() reqBody: any, @Req() req: any) {
    const endUserIp = this.getValidIp(req);
    if (req.user) {
      reqBody.userId = reqBody.userId || req.user.userId;
      reqBody.email = reqBody.email || req.user.email;
    }

    return this.flightService.bookFlight(reqBody, endUserIp);
  }

  @Post('ticket')
  @UseGuards(JwtAuthGuard)
  async ticketFlight(@Body() reqBody: any, @Req() req: any) {
    const endUserIp = this.getValidIp(req);
    if (req.user) {
      reqBody.userId = reqBody.userId || req.user.userId;
      reqBody.email = reqBody.email || req.user.email;
    }

    return this.flightService.ticketFlight(reqBody, endUserIp);
  }

  @Post('booking-details')
  async getBookingDetails(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getBookingDetails(reqBody, endUserIp);
  }

  @Post('release-pnr')
  async releasePNR(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.releasePNR(reqBody, endUserIp);
  }

  @Post('send-change-request')
  async sendChangeRequest(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.sendChangeRequest(reqBody, endUserIp);
  }

  @Post('change-request-status')
  async getChangeRequestStatus(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getChangeRequestStatus(reqBody, endUserIp);
  }

  @Post('cancellation-charges')
  async getCancellationCharges(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);

    return this.flightService.getCancellationCharges(reqBody, endUserIp);
  }

  // --- Database Fetch Routes ---

  @Post('my-bookings')
  @UseGuards(JwtAuthGuard)
  async getMyBookings(@Body() reqBody: any, @Req() req: any) {
    const endUserIp = this.getValidIp(req);
    if (req.user && req.user.role !== 'admin') {
      reqBody.userId = req.user.userId;
      reqBody.email = req.user.email;
    }
    return this.flightService.getMyBookings(reqBody, endUserIp);
  }

  @Post('my-cancellations')
  @UseGuards(JwtAuthGuard)
  async getMyCancellations(@Body() reqBody: any, @Req() req: any) {
    const endUserIp = this.getValidIp(req);
    if (req.user && req.user.role !== 'admin') {
      reqBody.userId = req.user.userId;
      reqBody.email = req.user.email;
    }
    return this.flightService.getMyCancellations(reqBody, endUserIp);
  }

  @Post('cancellation-by-booking')
  async getCancellationByBooking(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp = this.getValidIp(req);
    return this.flightService.getCancellationByBooking(reqBody, endUserIp);
  }

  @Get('admin/all-bookings')
  @UseGuards(JwtAuthGuard)
  async getAllFlightBookings() {
    return this.flightService.getAllFlightBookings();
  }
}
