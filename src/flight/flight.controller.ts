import { Controller, Post, Body, Req } from '@nestjs/common';
import { FlightService } from './flight.service';
import { FlightSearchDto } from './dto/flight-search.dto';
import type { Request } from 'express';

@Controller('flight')
export class FlightController {
  constructor(private readonly flightService: FlightService) { }

  @Post('search')
  async searchFlights(@Body() searchDto: FlightSearchDto, @Req() req: Request) {
    // Get the real user IP from the incoming request
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.searchFlights(searchDto, endUserIp);
  }

  @Post('calendar-fare')
  async getCalendarFare(@Body() searchDto: FlightSearchDto, @Req() req: Request) {
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.getCalendarFare(searchDto, endUserIp);
  }

  @Post('update-calendar-fare')
  async updateCalendarFareOfDay(@Body() searchDto: FlightSearchDto, @Req() req: Request) {
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.updateCalendarFareOfDay(searchDto, endUserIp);
  }

  @Post('fare-upsell')
  async getFareUpsell(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.getFareUpsell(reqBody, endUserIp);
  }

  @Post('fare-rule')
  async getFareRule(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.getFareRule(reqBody, endUserIp);
  }

  @Post('fare-quote')
  async getFareQuote(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.getFareQuote(reqBody, endUserIp);
  }

  @Post('ssr')
  async getSSR(@Body() reqBody: any, @Req() req: Request) {
    const endUserIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '103.98.38.139'; // fallback IP

    return this.flightService.getSSR(reqBody, endUserIp);
  }
}

