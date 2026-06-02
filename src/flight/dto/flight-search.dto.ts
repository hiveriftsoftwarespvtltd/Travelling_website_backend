import { IsString, IsNumber, IsBoolean, IsArray, IsOptional } from 'class-validator';

export class FlightSegmentDto {
  @IsString()
  Origin: string;

  @IsString()
  Destination: string;

  @IsNumber()
  FlightCabinClass: number;

  @IsString()
  PreferredDepartureTime: string;

  @IsString()
  PreferredArrivalTime: string;
}

export class FlightSearchDto {
  @IsNumber()
  AdultCount: number;

  @IsNumber()
  ChildCount: number;

  @IsNumber()
  InfantCount: number;

  @IsBoolean()
  DirectFlight: boolean;

  @IsBoolean()
  OneStopFlight: boolean;

  @IsNumber()
  JourneyType: number;

  @IsOptional()
  PreferredAirlines: string[] | null;

  @IsArray()
  Segments: FlightSegmentDto[];

  @IsOptional()
  Sources: any;
}
