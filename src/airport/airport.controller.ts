import { Controller, Get, Query } from '@nestjs/common';
import { AirportService } from './airport.service';

@Controller('airports')
export class AirportController {
  constructor(private readonly airportService: AirportService) {}

  @Get('search')
  async searchAirports(@Query('q') query: string) {
    const results = await this.airportService.searchAirports(query);
    return {
      success: true,
      data: results,
    };
  }
}
