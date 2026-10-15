import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FlightPricingService } from './flight-pricing.service';
import { CompetitorPricingService } from './competitor-pricing.service';
import {
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
  UpdateRuleStatusDto,
  CalculatePriceDto,
} from './dto/flight-pricing.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/flight-pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class FlightPricingController {
  constructor(
    private readonly pricingService: FlightPricingService,
    private readonly competitorPricingService: CompetitorPricingService,
  ) {}

  /**
   * GET /api/admin/flight-pricing/dashboard
   * Returns overview metrics and summary of active rules
   */
  @Get('dashboard')
  async getDashboard() {
    return this.pricingService.getDashboardSummary();
  }

  /**
   * GET /api/admin/flight-pricing/rules
   * Filter rules by marketType and status
   */
  @Get('rules')
  async getRules(
    @Query('marketType') marketType?: string,
    @Query('status') status?: string,
  ) {
    return this.pricingService.getRules({ marketType, status });
  }

  /**
   * GET /api/admin/flight-pricing/rules/:id
   * Get single rule by ID
   */
  @Get('rules/:id')
  async getRuleById(@Param('id') id: string) {
    return this.pricingService.getRuleById(id);
  }

  /**
   * POST /api/admin/flight-pricing/rules
   * Add new pricing rule with overlap check & audit history
   */
  @Post('rules')
  async createRule(@Body() dto: CreatePricingRuleDto, @Request() req: any) {
    return this.pricingService.createRule(dto, req.user);
  }

  /**
   * PUT /api/admin/flight-pricing/rules/:id
   * Update existing pricing rule
   */
  @Put('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdatePricingRuleDto,
    @Request() req: any,
  ) {
    return this.pricingService.updateRule(id, dto, req.user);
  }

  /**
   * PATCH /api/admin/flight-pricing/rules/:id/status
   * Toggle rule active / inactive status
   */
  @Patch('rules/:id/status')
  async updateRuleStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRuleStatusDto,
    @Request() req: any,
  ) {
    return this.pricingService.updateRuleStatus(id, dto.status, req.user);
  }

  /**
   * GET /api/admin/flight-pricing/history
   * Retrieve pricing audit trail
   */
  @Get('history')
  async getHistory(@Query('limit') limit?: number) {
    return this.pricingService.getHistory(limit ? Number(limit) : 100);
  }

  /**
   * GET /api/admin/flight-pricing/reviews
   * Retrieve flagged flight pricing reviews compared against MakeMyTrip
   */
  @Get('reviews')
  async getReviews(
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    return this.competitorPricingService.getFlaggedReviews({ status, limit });
  }

  /**
   * PATCH /api/admin/flight-pricing/reviews/:id/resolve
   * Resolve a flagged flight review
   */
  @Patch('reviews/:id/resolve')
  async resolveReview(
    @Param('id') id: string,
    @Body() body: { status: any; notes?: string },
    @Request() req: any,
  ) {
    return this.competitorPricingService.resolveReview(id, {
      status: body.status,
      notes: body.notes,
      user: req.user?.email || 'Admin',
    });
  }

  /**
   * POST /api/admin/flight-pricing/calculate
   * Dedicated pricing calculator tester using the EXACT same backend calculation engine
   */
  @Post('calculate')
  async calculatePrice(@Body() dto: CalculatePriceDto) {
    return this.pricingService.calculateFlightPrice(
      dto.supplierFare,
      dto.marketType,
      {
        paxCount: dto.paxCount,
        convenienceFee: dto.convenienceFee,
        discountAmount: dto.discountAmount,
      },
    );
  }
}

