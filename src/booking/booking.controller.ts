import { Controller, Post, Body } from '@nestjs/common';
import { BookingService } from './booking.service';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('book')
  async bookFlight(@Body() bookingData: any) {
    return this.bookingService.bookFlight(bookingData);
  }

  @Post('ticket')
  async generateTicket(@Body() ticketData: any) {
    return this.bookingService.generateTicket(ticketData);
  }

  @Post('cancel')
  async cancelTicket(@Body() cancelData: any) {
    return this.bookingService.cancelTicket(cancelData);
  }
}
