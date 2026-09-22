import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  FlightPricingRule,
  FlightPricingRuleDocument,
  MarketType,
  MarkupType,
  RuleStatus,
} from './schemas/flight-pricing-rule.schema';
import {
  FlightPricingHistory,
  FlightPricingHistoryDocument,
  HistoryAction,
} from './schemas/flight-pricing-history.schema';
import {
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
  CalculatePriceDto,
} from './dto/flight-pricing.dto';

export interface FlightPriceResult {
  supplierFare: number;
  marketType: MarketType;
  markupPercentage: number;
  markupType: MarkupType;
  fixedMarkup: number;
  rawMarkup: number;
  markupAmount: number;
  minimumMarkup: number;
  maximumMarkup: number;
  discountAmount: number;
  convenienceFee: number;
  finalCustomerFare: number;
  pricingRuleId: string | null;
  ruleRange: string;
  calculatedAt: string;
}

@Injectable()
export class FlightPricingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlightPricingService.name);

  // In-memory cache for active rules to ensure high performance during searches
  private activeRulesCache: {
    domestic: FlightPricingRuleDocument[];
    international: FlightPricingRuleDocument[];
    timestamp: number;
  } | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000;

  constructor(
    @InjectModel(FlightPricingRule.name)
    private readonly ruleModel: Model<FlightPricingRuleDocument>,
    @InjectModel(FlightPricingHistory.name)
    private readonly historyModel: Model<FlightPricingHistoryDocument>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedDefaultRulesIfEmpty();
  }

  public invalidateCache() {
    this.activeRulesCache = null;
  }

  /**
   * Auto-seed default Domestic (8 slabs) and International (11 slabs) rules if collection is empty.
   */
  async seedDefaultRulesIfEmpty() {
    try {
      const count = await this.ruleModel.countDocuments();
      if (count > 0) {
        this.logger.log(`📊 Flight pricing rules loaded (${count} existing rules in database).`);
        return;
      }

      this.logger.log('🌱 Seeding initial default Domestic and International flight pricing rules...');

      const defaultDomestic = [
        { minFare: 0, maxFare: 5000, markupPercentage: 8, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 5001, maxFare: 10000, markupPercentage: 7, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 10001, maxFare: 15000, markupPercentage: 6, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 15001, maxFare: 25000, markupPercentage: 5, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 25001, maxFare: 40000, markupPercentage: 4, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 40001, maxFare: 60000, markupPercentage: 3.5, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 60001, maxFare: 100000, markupPercentage: 3, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
        { minFare: 100001, maxFare: 999999999, markupPercentage: 2.5, minimumMarkup: 300, maximumMarkup: 3000, priority: 1 },
      ];

      const defaultInternational = [
        { minFare: 0, maxFare: 5000, markupPercentage: 8, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 5001, maxFare: 10000, markupPercentage: 7, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 10001, maxFare: 20000, markupPercentage: 6, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 20001, maxFare: 30000, markupPercentage: 5, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 30001, maxFare: 50000, markupPercentage: 4, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 50001, maxFare: 75000, markupPercentage: 3.5, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 75001, maxFare: 100000, markupPercentage: 3, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 100001, maxFare: 150000, markupPercentage: 2.5, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 150001, maxFare: 200000, markupPercentage: 2, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 200001, maxFare: 300000, markupPercentage: 1.75, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
        { minFare: 300001, maxFare: 999999999, markupPercentage: 1.5, minimumMarkup: 500, maximumMarkup: 5000, priority: 1 },
      ];

      const seedDocs = [
        ...defaultDomestic.map((r) => ({
          ...r,
          marketType: MarketType.DOMESTIC,
          markupType: MarkupType.PERCENTAGE,
          fixedMarkup: 0,
          status: RuleStatus.ACTIVE,
          createdBy: 'System Seed',
          updatedBy: 'System Seed',
        })),
        ...defaultInternational.map((r) => ({
          ...r,
          marketType: MarketType.INTERNATIONAL,
          markupType: MarkupType.PERCENTAGE,
          fixedMarkup: 0,
          status: RuleStatus.ACTIVE,
          createdBy: 'System Seed',
          updatedBy: 'System Seed',
        })),
      ];

      const inserted = await this.ruleModel.insertMany(seedDocs);

      await this.historyModel.create({
        marketType: 'ALL',
        fareRange: 'Initial Seeding',
        newMarkup: 'Standard Default Slabs',
        action: HistoryAction.CREATE,
        changedBy: 'System Seed',
        status: 'ACTIVE',
        details: { message: `Seeded ${inserted.length} default rules.` },
      });

      this.logger.log(`✅ Successfully seeded ${inserted.length} default flight pricing rules.`);
    } catch (err) {
      this.logger.error('Failed to seed default pricing rules', err?.message);
    }
  }

  private async getActiveRules(): Promise<{
    domestic: FlightPricingRuleDocument[];
    international: FlightPricingRuleDocument[];
  }> {
    const now = Date.now();
    if (this.activeRulesCache && now - this.activeRulesCache.timestamp < this.CACHE_TTL_MS) {
      return this.activeRulesCache;
    }

    const rules = await this.ruleModel
      .find({ status: RuleStatus.ACTIVE })
      .sort({ priority: -1, minFare: 1 })
      .exec();

    const nowDate = new Date();
    const validRules = rules.filter((r) => {
      if (r.validFrom && r.validFrom > nowDate) return false;
      if (r.validUntil && r.validUntil < nowDate) return false;
      return true;
    });

    this.activeRulesCache = {
      domestic: validRules.filter((r) => r.marketType === MarketType.DOMESTIC),
      international: validRules.filter((r) => r.marketType === MarketType.INTERNATIONAL),
      timestamp: now,
    };

    return this.activeRulesCache;
  }

  /**
   * CENTRALIZED PRICING ENGINE
   * Formula:
   * 1. Receive supplier fare & determine market
   * 2. Find active rule where minFare <= supplierFare <= maxFare
   * 3. Calculate raw markup:
   *    if PERCENTAGE: supplierFare * (markupPercentage / 100)
   *    if FIXED: fixedMarkup * (paxCount || 1)
   * 4. Clamp markupAmount:
   *    if markupAmount < minimumMarkup: minimumMarkup
   *    if markupAmount > maximumMarkup: maximumMarkup
   * 5. customerFare = supplierFare + markupAmount + convenienceFee - discountAmount
   * 6. Return separate supplier and customer fare breakdown snapshot
   */
  async calculateFlightPrice(
    supplierFare: number,
    marketType: MarketType | string,
    options?: {
      paxCount?: number;
      convenienceFee?: number;
      discountAmount?: number;
    },
  ): Promise<FlightPriceResult> {
    const safeFare = Math.max(0, Math.round(Number(supplierFare) || 0));
    const normalizedMarket =
      String(marketType).toUpperCase() === 'INTERNATIONAL'
        ? MarketType.INTERNATIONAL
        : MarketType.DOMESTIC;

    const paxCount = Math.max(1, Number(options?.paxCount) || 1);
    const convenienceFee = Math.max(0, Math.round(Number(options?.convenienceFee) || 0));
    const discountAmount = Math.max(0, Math.round(Number(options?.discountAmount) || 0));

    const activeCache = await this.getActiveRules();
    const ruleList =
      normalizedMarket === MarketType.INTERNATIONAL
        ? activeCache.international
        : activeCache.domestic;

    const matchingRule = ruleList.find(
      (r) => safeFare >= r.minFare && safeFare <= r.maxFare,
    );

    let markupType = MarkupType.PERCENTAGE;
    let markupPercentage = 0;
    let fixedMarkup = 0;
    let minimumMarkup = 0;
    let maximumMarkup = 0;
    let rawMarkup = 0;
    let markupAmount = 0;
    let ruleId: string | null = null;
    let ruleRange = 'Default Fallback';

    if (matchingRule) {
      ruleId = matchingRule._id.toString();
      markupType = matchingRule.markupType;
      markupPercentage = matchingRule.markupPercentage || 0;
      fixedMarkup = matchingRule.fixedMarkup || 0;
      minimumMarkup = matchingRule.minimumMarkup || 0;
      maximumMarkup = matchingRule.maximumMarkup || 0;
      ruleRange = `₹${matchingRule.minFare.toLocaleString('en-IN')} – ${
        matchingRule.maxFare >= 999999999
          ? 'Above'
          : `₹${matchingRule.maxFare.toLocaleString('en-IN')}`
      }`;

      if (markupType === MarkupType.PERCENTAGE) {
        rawMarkup = Math.round(safeFare * (markupPercentage / 100));
      } else {
        rawMarkup = Math.round(fixedMarkup * paxCount);
      }

      markupAmount = rawMarkup;

      if (minimumMarkup > 0 && markupAmount < minimumMarkup) {
        markupAmount = minimumMarkup;
      }

      if (maximumMarkup > 0 && markupAmount > maximumMarkup) {
        markupAmount = maximumMarkup;
      }
    } else {
      this.logger.warn(
        `⚠️ No matching flight pricing rule for ${normalizedMarket} fare ₹${safeFare}. Using safety fallback.`,
      );
      markupPercentage = normalizedMarket === MarketType.DOMESTIC ? 5 : 6;
      minimumMarkup = normalizedMarket === MarketType.DOMESTIC ? 300 : 500;
      maximumMarkup = normalizedMarket === MarketType.DOMESTIC ? 3000 : 5000;
      rawMarkup = Math.round(safeFare * (markupPercentage / 100));
      markupAmount = Math.max(minimumMarkup, Math.min(maximumMarkup, rawMarkup));
      ruleRange = 'Safety Fallback';
    }

    const finalCustomerFare = Math.max(
      0,
      safeFare + markupAmount + convenienceFee - discountAmount,
    );

    return {
      supplierFare: safeFare,
      marketType: normalizedMarket,
      markupPercentage,
      markupType,
      fixedMarkup,
      rawMarkup,
      markupAmount,
      minimumMarkup,
      maximumMarkup,
      discountAmount,
      convenienceFee,
      finalCustomerFare,
      pricingRuleId: ruleId,
      ruleRange,
      calculatedAt: new Date().toISOString(),
    };
  }

  async checkFareOverlap(
    marketType: MarketType,
    minFare: number,
    maxFare: number,
    excludeRuleId?: string,
  ): Promise<void> {
    if (minFare >= maxFare) {
      throw new BadRequestException('Minimum Fare must be strictly less than Maximum Fare.');
    }

    const query: any = {
      marketType,
      status: RuleStatus.ACTIVE,
    };

    if (excludeRuleId && Types.ObjectId.isValid(excludeRuleId)) {
      query._id = { $ne: new Types.ObjectId(excludeRuleId) };
    }

    const activeRules = await this.ruleModel.find(query).exec();

    for (const rule of activeRules) {
      const isOverlap = Math.max(minFare, rule.minFare) <= Math.min(maxFare, rule.maxFare);
      if (isOverlap) {
        throw new BadRequestException(
          `Overlapping active fare range detected: (₹${minFare} – ₹${maxFare}) overlaps with existing rule (₹${rule.minFare} – ₹${rule.maxFare}). Deactivate or adjust the existing rule first.`,
        );
      }
    }
  }

  async getDashboardSummary() {
    const [allRules, lastHistory] = await Promise.all([
      this.ruleModel.find().sort({ updatedAt: -1 }).exec(),
      this.historyModel.findOne().sort({ createdAt: -1 }).exec(),
    ]);

    const activeDomestic = allRules.filter(
      (r) => r.marketType === MarketType.DOMESTIC && r.status === RuleStatus.ACTIVE,
    );
    const activeInternational = allRules.filter(
      (r) => r.marketType === MarketType.INTERNATIONAL && r.status === RuleStatus.ACTIVE,
    );
    const inactiveRules = allRules.filter((r) => r.status === RuleStatus.INACTIVE);

    const activeRules = [...activeDomestic, ...activeInternational];
    const minMarkups = activeRules.map((r) => r.minimumMarkup).filter((v) => v > 0);
    const maxMarkups = activeRules.map((r) => r.maximumMarkup).filter((v) => v > 0);

    const currentMinMarkup = minMarkups.length > 0 ? Math.min(...minMarkups) : 300;
    const currentMaxMarkup = maxMarkups.length > 0 ? Math.max(...maxMarkups) : 5000;

    return {
      activeDomesticCount: activeDomestic.length,
      activeInternationalCount: activeInternational.length,
      totalActiveRules: activeRules.length,
      inactiveRulesCount: inactiveRules.length,
      totalRules: allRules.length,
      currentMinMarkup,
      currentMaxMarkup,
      lastPricingUpdate:
        (lastHistory as any)?.createdAt ||
        (allRules[0] as any)?.updatedAt ||
        new Date(),
      lastUpdatedBy: lastHistory?.changedBy || allRules[0]?.updatedBy || 'System',
      domesticSummary: {
        activeCount: activeDomestic.length,
        slabs: activeDomestic.map((r) => ({
          range: `₹${r.minFare.toLocaleString('en-IN')} - ${r.maxFare >= 999999999 ? 'Above' : `₹${r.maxFare.toLocaleString('en-IN')}`}`,
          markup: r.markupType === MarkupType.PERCENTAGE ? `${r.markupPercentage}%` : `₹${r.fixedMarkup}`,
        })),
      },
      internationalSummary: {
        activeCount: activeInternational.length,
        slabs: activeInternational.map((r) => ({
          range: `₹${r.minFare.toLocaleString('en-IN')} - ${r.maxFare >= 999999999 ? 'Above' : `₹${r.maxFare.toLocaleString('en-IN')}`}`,
          markup: r.markupType === MarkupType.PERCENTAGE ? `${r.markupPercentage}%` : `₹${r.fixedMarkup}`,
        })),
      },
    };
  }

  async getRules(query?: { marketType?: string; status?: string }) {
    const filter: any = {};
    if (query?.marketType && query.marketType !== 'ALL') {
      filter.marketType = query.marketType.toUpperCase();
    }
    if (query?.status && query.status !== 'ALL') {
      filter.status = query.status.toUpperCase();
    }

    return this.ruleModel
      .find(filter)
      .sort({ marketType: 1, minFare: 1, priority: -1 })
      .exec();
  }

  async getRuleById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid rule ID format.');
    }
    const rule = await this.ruleModel.findById(id).exec();
    if (!rule) {
      throw new NotFoundException('Pricing rule not found.');
    }
    return rule;
  }

  async createRule(dto: CreatePricingRuleDto, adminUser?: any) {
    const adminIdentifier = adminUser?.email || adminUser?.name || 'Admin';

    if (dto.status === RuleStatus.ACTIVE || !dto.status) {
      await this.checkFareOverlap(dto.marketType, dto.minFare, dto.maxFare);
    }

    const newRule = await this.ruleModel.create({
      ...dto,
      status: dto.status || RuleStatus.ACTIVE,
      createdBy: adminIdentifier,
      updatedBy: adminIdentifier,
    });

    const markupDisplay =
      newRule.markupType === MarkupType.PERCENTAGE
        ? `${newRule.markupPercentage}%`
        : `₹${newRule.fixedMarkup}`;

    await this.historyModel.create({
      ruleId: newRule._id,
      marketType: newRule.marketType,
      fareRange: `₹${newRule.minFare} – ₹${newRule.maxFare}`,
      oldMarkup: 'None (New Rule)',
      newMarkup: markupDisplay,
      oldMinimum: 0,
      newMinimum: newRule.minimumMarkup,
      oldMaximum: 0,
      newMaximum: newRule.maximumMarkup,
      action: HistoryAction.CREATE,
      changedBy: adminIdentifier,
      status: newRule.status,
      details: dto,
    });

    this.invalidateCache();
    return newRule;
  }

  async updateRule(id: string, dto: UpdatePricingRuleDto, adminUser?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid rule ID format.');
    }

    const existing = await this.ruleModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Pricing rule not found.');
    }

    const adminIdentifier = adminUser?.email || adminUser?.name || 'Admin';

    const targetMarket = dto.marketType || existing.marketType;
    const targetMin = dto.minFare !== undefined ? dto.minFare : existing.minFare;
    const targetMax = dto.maxFare !== undefined ? dto.maxFare : existing.maxFare;
    const targetStatus = dto.status || existing.status;

    if (targetStatus === RuleStatus.ACTIVE) {
      await this.checkFareOverlap(targetMarket, targetMin, targetMax, id);
    }

    const oldMarkupDisplay =
      existing.markupType === MarkupType.PERCENTAGE
        ? `${existing.markupPercentage}%`
        : `₹${existing.fixedMarkup}`;

    Object.keys(dto).forEach((key) => {
      if ((dto as any)[key] !== undefined) {
        (existing as any)[key] = (dto as any)[key];
      }
    });
    existing.updatedBy = adminIdentifier;
    const updated = await existing.save();

    const newMarkupDisplay =
      updated.markupType === MarkupType.PERCENTAGE
        ? `${updated.markupPercentage}%`
        : `₹${updated.fixedMarkup}`;

    await this.historyModel.create({
      ruleId: updated._id,
      marketType: updated.marketType,
      fareRange: `₹${updated.minFare} – ₹${updated.maxFare}`,
      oldMarkup: oldMarkupDisplay,
      newMarkup: newMarkupDisplay,
      oldMinimum: existing.minimumMarkup,
      newMinimum: updated.minimumMarkup,
      oldMaximum: existing.maximumMarkup,
      newMaximum: updated.maximumMarkup,
      action: HistoryAction.UPDATE,
      changedBy: adminIdentifier,
      status: updated.status,
      details: { updatedFields: dto },
    });

    this.invalidateCache();
    return updated;
  }

  async updateRuleStatus(id: string, status: RuleStatus, adminUser?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid rule ID format.');
    }

    const rule = await this.ruleModel.findById(id).exec();
    if (!rule) {
      throw new NotFoundException('Pricing rule not found.');
    }

    const adminIdentifier = adminUser?.email || adminUser?.name || 'Admin';

    if (status === RuleStatus.ACTIVE) {
      await this.checkFareOverlap(rule.marketType, rule.minFare, rule.maxFare, id);
    }

    const oldStatus = rule.status;
    rule.status = status;
    rule.updatedBy = adminIdentifier;
    const updated = await rule.save();

    const markupDisplay =
      rule.markupType === MarkupType.PERCENTAGE
        ? `${rule.markupPercentage}%`
        : `₹${rule.fixedMarkup}`;

    await this.historyModel.create({
      ruleId: updated._id,
      marketType: updated.marketType,
      fareRange: `₹${updated.minFare} – ₹${updated.maxFare}`,
      oldMarkup: markupDisplay,
      newMarkup: markupDisplay,
      oldMinimum: rule.minimumMarkup,
      newMinimum: rule.minimumMarkup,
      oldMaximum: rule.maximumMarkup,
      newMaximum: rule.maximumMarkup,
      action: status === RuleStatus.ACTIVE ? HistoryAction.ACTIVATE : HistoryAction.DEACTIVATE,
      changedBy: adminIdentifier,
      status: updated.status,
      details: { previousStatus: oldStatus, newStatus: status },
    });

    this.invalidateCache();
    return updated;
  }

  async getHistory(limit = 100) {
    return this.historyModel
      .find()
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 500))
      .exec();
  }
}
