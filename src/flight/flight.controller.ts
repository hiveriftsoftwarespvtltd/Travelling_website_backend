import { Controller, Post, Body } from '@nestjs/common';
import { FlightService } from './flight.service';

@Controller('flight')
export class FlightController {
  constructor(private readonly flightService: FlightService) {}

  @Post('search')
  async searchFlights(@Body() searchData: any) {
    return this.flightService.searchFlights(searchData);
  }

  @Post('fare-quote')
  async fareQuote(@Body() quoteData: any) {
    return this.flightService.fareQuote(quoteData);
  }
}
