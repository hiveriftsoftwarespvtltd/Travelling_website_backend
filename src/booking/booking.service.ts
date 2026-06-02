import { Injectable } from '@nestjs/common';
import { TravelApiService } from '../common/travel-api.service';

@Injectable()
export class BookingService {
  constructor(private readonly travelApiService: TravelApiService) {}

  async bookFlight(bookingData: any) {
    return this.travelApiService.bookFlight(bookingData);
  }

  async generateTicket(ticketData: any) {
    return this.travelApiService.generateTicket(ticketData);
  }

  async cancelTicket(cancelData: any) {
    return this.travelApiService.cancelTicket(cancelData);
  }
}
