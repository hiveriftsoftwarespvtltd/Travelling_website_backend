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
}

