import { Injectable } from '@nestjs/common';
import { TravelApiService } from '../common/travel-api.service';

@Injectable()
export class FlightService {
  constructor(private readonly travelApiService: TravelApiService) {}

  async searchFlights(searchData: any) {
    // The TravelApiService handles token injection and auto-retries internally
    return this.travelApiService.searchFlight(searchData);
  }

  async fareQuote(quoteData: any) {
    return this.travelApiService.fareQuote(quoteData);
  }
}
