import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { TokenService } from './token.service';
import { TravelToken, TravelTokenSchema } from './token.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: TravelToken.name, schema: TravelTokenSchema }]),
    HttpModule,
  ],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
