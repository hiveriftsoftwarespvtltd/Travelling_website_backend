import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';
import { MarketType, MarkupType, RuleStatus } from '../schemas/flight-pricing-rule.schema';

export class CreatePricingRuleDto {
  @IsEnum(MarketType, { message: 'marketType must be DOMESTIC or INTERNATIONAL' })
  marketType: MarketType;

  @IsNumber()
  @Min(0, { message: 'minFare cannot be negative' })
  minFare: number;

  @IsNumber()
  @Min(0, { message: 'maxFare cannot be negative' })
  maxFare: number;

  @IsEnum(MarkupType, { message: 'markupType must be PERCENTAGE or FIXED' })
  markupType: MarkupType;

  @IsNumber()
  @Min(0, { message: 'markupPercentage cannot be negative' })
  @IsOptional()
  markupPercentage?: number;

  @IsNumber()
  @Min(0, { message: 'fixedMarkup cannot be negative' })
  @IsOptional()
  fixedMarkup?: number;

  @IsNumber()
  @Min(0, { message: 'minimumMarkup cannot be negative' })
  @IsOptional()
  minimumMarkup?: number;

  @IsNumber()
  @Min(0, { message: 'maximumMarkup cannot be negative' })
  @IsOptional()
  maximumMarkup?: number;

  @IsEnum(RuleStatus)
  @IsOptional()
  status?: RuleStatus;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsOptional()
  validFrom?: string | Date;

  @IsOptional()
  validUntil?: string | Date;
}

export class UpdatePricingRuleDto {
  @IsEnum(MarketType)
  @IsOptional()
  marketType?: MarketType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minFare?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxFare?: number;

  @IsEnum(MarkupType)
  @IsOptional()
  markupType?: MarkupType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  markupPercentage?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fixedMarkup?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumMarkup?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maximumMarkup?: number;

  @IsEnum(RuleStatus)
  @IsOptional()
  status?: RuleStatus;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsOptional()
  validFrom?: string | Date;

  @IsOptional()
  validUntil?: string | Date;
}

export class UpdateRuleStatusDto {
  @IsEnum(RuleStatus)
  status: RuleStatus;
}

export class CalculatePriceDto {
  @IsNumber()
  @Min(0, { message: 'Supplier fare must be a positive number' })
  supplierFare: number;

  @IsEnum(MarketType, { message: 'marketType must be DOMESTIC or INTERNATIONAL' })
  marketType: MarketType;

  @IsNumber()
  @Min(1)
  @IsOptional()
  paxCount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  convenienceFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;
}
