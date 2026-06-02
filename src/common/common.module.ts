import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TravelApiService } from './travel-api.service';
import { TokenModule } from '../token/token.module';

@Global()
@Module({
  imports: [HttpModule, TokenModule],
  providers: [TravelApiService],
  exports: [TravelApiService],
})
export class CommonModule {}
