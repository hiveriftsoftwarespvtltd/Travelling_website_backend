import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, AirportDocument } from './schemas/airport.schema';
import * as fs from 'fs';
import * as path from 'path';
const csv = require('csv-parser');

@Injectable()
export class AirportService implements OnModuleInit {
  private readonly logger = new Logger(AirportService.name);

  constructor(
    @InjectModel(Airport.name) private airportModel: Model<AirportDocument>,
  ) {}

  async onModuleInit() {
    await this.seedAirports();
  }

  private async seedAirports() {
    try {
      const count = await this.airportModel.countDocuments();
      if (count > 0) {
        this.logger.log(
          `Airports collection already seeded with ${count} records.`,
        );
        return;
      }

      this.logger.log('Airports collection is empty. Starting CSV import...');
      const csvFilePath = path.join(process.cwd(), 'data', 'airports.csv');

      if (!fs.existsSync(csvFilePath)) {
        this.logger.warn(
          `CSV file not found at ${csvFilePath}. Skipping import.`,
        );
        return;
      }

      const airportsData: any[] = [];

      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          // Check if AIRPORTCODE is present to avoid empty trailing rows
          if (row.AIRPORTCODE) {
            airportsData.push({
              AIRPORTNAME: row.AIRPORTNAME,
              AIRPORTCODE: row.AIRPORTCODE,
              CITYNAME: row.CITYNAME,
              CITYCODE: row.CITYCODE,
              COUNTRYCODE: row.COUNTRYCODE,
              COUNTRYNAME: row.COUNTRYNAME,
            });
          }
        })
        .on('end', async () => {
          this.logger.log(
            `Successfully parsed ${airportsData.length} records. Bulk inserting into MongoDB...`,
          );
          try {
            await this.airportModel.insertMany(airportsData);
            this.logger.log('Successfully seeded airports collection.');
          } catch (error) {
            this.logger.error('Error inserting records into MongoDB', error);
          }
        });
    } catch (error) {
      this.logger.error('Error seeding airports', error);
    }
  }

  private inMemoryAirports: any[] = [];
  private isLoaded = false;

  private async ensureLoaded() {
    if (this.isLoaded && this.inMemoryAirports.length > 0) return;
    try {
      const records = await this.airportModel.find().lean().exec();
      if (records && records.length > 0) {
        this.inMemoryAirports = records;
        this.isLoaded = true;
      }
    } catch (e) {
      this.logger.error('Failed to pre-load airports into memory', e);
    }
  }

  async searchAirports(query: string) {
    await this.ensureLoaded();

    if (!query || query.trim().length === 0) {
      // Default top airports
      const defaults = ['DEL', 'BOM', 'BLR', 'HYD', 'CCU', 'GOI', 'DXB', 'LON'];
      return this.inMemoryAirports
        .filter((a) => defaults.includes(a.AIRPORTCODE))
        .slice(0, 10);
    }

    const q = query.trim().toLowerCase();
    const exactUpper = q.toUpperCase();
    const wordRegex = new RegExp('(^|\\s)' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const results: any[] = [];
    const matchedMetroCityCodes = new Set<string>();

    // 1. Check if query matches a multi-airport metropolitan area
    for (const [metroCode, metro] of Object.entries(MAJOR_MULTI_AIRPORT_CITIES)) {
      const codeMatch = metroCode.toLowerCase().startsWith(q) || metroCode === exactUpper;
      const cityMatch = metro.cityName.toLowerCase().startsWith(q) || wordRegex.test(metro.cityName);
      const subMatch = metro.airports.some(
        (a) => a.code.toLowerCase() === q || a.name.toLowerCase().includes(q),
      );
      const aliasMatch = metro.aliases?.some(
        (al) => al.startsWith(q) || q.startsWith(al),
      );

      if (codeMatch || cityMatch || subMatch || aliasMatch) {
        matchedMetroCityCodes.add(metroCode);
        results.push({
          AIRPORTCODE: metro.cityCode,
          AIRPORTNAME: `${metro.cityName} all airports`,
          CITYNAME: metro.cityName,
          CITYCODE: metro.cityCode,
          COUNTRYCODE: metro.countryCode,
          COUNTRYNAME: metro.countryName,
          isCityGroup: true,
          subAirports: metro.airports.map((sub) => ({
            AIRPORTCODE: sub.code,
            AIRPORTNAME: sub.name,
            CITYNAME: metro.cityName,
            CITYCODE: metro.cityCode,
            COUNTRYCODE: metro.countryCode,
            COUNTRYNAME: metro.countryName,
            distance: sub.distance,
          })),
          score: (codeMatch || aliasMatch) ? 15000 : cityMatch ? 10000 : 8000,
        });
      }
    }

    // 2. Search database airports with relevance ranking
    const pool = this.inMemoryAirports.length > 0 ? this.inMemoryAirports : await this.airportModel.find().lean().exec();

    for (const a of pool) {
      const aCode = a.AIRPORTCODE?.toUpperCase() || '';
      const cCode = a.CITYCODE?.toUpperCase() || '';
      const cName = a.CITYNAME?.toLowerCase() || '';
      const aName = a.AIRPORTNAME?.toLowerCase() || '';
      const coName = a.COUNTRYNAME?.toLowerCase() || '';

      // Skip if this airport is already grouped under a matched metro
      const isSubOfMatchedMetro = Array.from(matchedMetroCityCodes).some((mc) =>
        MAJOR_MULTI_AIRPORT_CITIES[mc]?.airports.some((sub) => sub.code === aCode),
      );
      if (isSubOfMatchedMetro) continue;

      let score = 0;

      if (aCode === exactUpper) score += 6000;
      else if (aCode.startsWith(exactUpper)) score += 3000;

      if (cCode === exactUpper) score += 4500;
      else if (cCode.startsWith(exactUpper)) score += 2500;

      if (cName === q) score += 4000;
      else if (cName.startsWith(q)) score += 3200;
      else if (wordRegex.test(cName)) score += 1800;
      else if (cName.includes(q)) score += 600;

      if (aName === q) score += 2500;
      else if (aName.startsWith(q)) score += 2000;
      else if (wordRegex.test(aName)) score += 1200;
      else if (aName.includes(q)) score += 400;

      if (coName.startsWith(q)) score += 300;

      if (score > 0) {
        if (POPULAR_PRIORITY[aCode]) {
          score += POPULAR_PRIORITY[aCode];
        }
        results.push({
          ...a,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 15);
  }
}

interface MultiAirportCityConfig {
  cityCode: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  aliases?: string[];
  airports: Array<{
    code: string;
    name: string;
    distance?: string;
  }>;
}

const MAJOR_MULTI_AIRPORT_CITIES: Record<string, MultiAirportCityConfig> = {
  LON: {
    cityCode: 'LON',
    cityName: 'London',
    countryName: 'United Kingdom',
    countryCode: 'GB',
    aliases: ['london', 'lon', 'lond'],
    airports: [
      { code: 'LHR', name: 'Heathrow Airport', distance: '23 km from London' },
      { code: 'LGW', name: 'Gatwick', distance: '40 km from London' },
      { code: 'LTN', name: 'Luton Airport', distance: '45 km from London' },
      { code: 'LCY', name: 'London City Airport', distance: '12 km from London' },
      { code: 'STN', name: 'Stansted Airport', distance: '55 km from London' },
    ],
  },
  NYC: {
    cityCode: 'NYC',
    cityName: 'New York',
    countryName: 'United States',
    countryCode: 'US',
    aliases: ['new york', 'nyc', 'ny'],
    airports: [
      { code: 'JFK', name: 'John F. Kennedy Intl Airport', distance: '26 km from New York' },
      { code: 'EWR', name: 'Newark Liberty Intl Airport', distance: '24 km from New York' },
      { code: 'LGA', name: 'LaGuardia Airport', distance: '15 km from New York' },
    ],
  },
  PAR: {
    cityCode: 'PAR',
    cityName: 'Paris',
    countryName: 'France',
    countryCode: 'FR',
    aliases: ['paris', 'par'],
    airports: [
      { code: 'CDG', name: 'Charles de Gaulle Airport', distance: '25 km from Paris' },
      { code: 'ORY', name: 'Orly Airport', distance: '14 km from Paris' },
      { code: 'BVA', name: 'Beauvais-Tillé Airport', distance: '85 km from Paris' },
    ],
  },
  GOI: {
    cityCode: 'GOI',
    cityName: 'Goa',
    countryName: 'India',
    countryCode: 'IN',
    aliases: ['goa', 'goi', 'north goa', 'south goa', 'mopa', 'dabolim'],
    airports: [
      { code: 'GOI', name: 'Dabolim Airport (South Goa)', distance: '29 km from Panaji' },
      { code: 'GOX', name: 'Manohar International Airport (Mopa / North Goa)', distance: '35 km from Panaji' },
    ],
  },
  DXB: {
    cityCode: 'DXB',
    cityName: 'Dubai',
    countryName: 'United Arab Emirates',
    countryCode: 'AE',
    aliases: ['dubai', 'dxb', 'dub'],
    airports: [
      { code: 'DXB', name: 'Dubai International Airport', distance: '5 km from Dubai' },
      { code: 'DWC', name: 'Al Maktoum International Airport', distance: '37 km from Dubai' },
    ],
  },
  BKK: {
    cityCode: 'BKK',
    cityName: 'Bangkok',
    countryName: 'Thailand',
    countryCode: 'TH',
    airports: [
      { code: 'BKK', name: 'Suvarnabhumi Airport', distance: '30 km from Bangkok' },
      { code: 'DMK', name: 'Don Mueang International Airport', distance: '24 km from Bangkok' },
    ],
  },
  TYO: {
    cityCode: 'TYO',
    cityName: 'Tokyo',
    countryName: 'Japan',
    countryCode: 'JP',
    airports: [
      { code: 'HND', name: 'Haneda Airport', distance: '14 km from Tokyo' },
      { code: 'NRT', name: 'Narita International Airport', distance: '60 km from Tokyo' },
    ],
  },
  MIL: {
    cityCode: 'MIL',
    cityName: 'Milan',
    countryName: 'Italy',
    countryCode: 'IT',
    airports: [
      { code: 'MXP', name: 'Milan Malpensa Airport', distance: '48 km from Milan' },
      { code: 'LIN', name: 'Milan Linate Airport', distance: '7 km from Milan' },
      { code: 'BGY', name: 'Orio al Serio (Bergamo)', distance: '45 km from Milan' },
    ],
  },
  ROM: {
    cityCode: 'ROM',
    cityName: 'Rome',
    countryName: 'Italy',
    countryCode: 'IT',
    airports: [
      { code: 'FCO', name: 'Leonardo da Vinci–Fiumicino', distance: '30 km from Rome' },
      { code: 'CIA', name: 'Ciampino Airport', distance: '15 km from Rome' },
    ],
  },
  IST: {
    cityCode: 'IST',
    cityName: 'Istanbul',
    countryName: 'Turkey',
    countryCode: 'TR',
    airports: [
      { code: 'IST', name: 'Istanbul Airport', distance: '35 km from Istanbul' },
      { code: 'SAW', name: 'Sabiha Gökçen International Airport', distance: '32 km from Istanbul' },
    ],
  },
  CHI: {
    cityCode: 'CHI',
    cityName: 'Chicago',
    countryName: 'United States',
    countryCode: 'US',
    airports: [
      { code: 'ORD', name: "O'Hare International Airport", distance: '27 km from Chicago' },
      { code: 'MDW', name: 'Midway International Airport', distance: '18 km from Chicago' },
    ],
  },
  WAS: {
    cityCode: 'WAS',
    cityName: 'Washington D.C.',
    countryName: 'United States',
    countryCode: 'US',
    airports: [
      { code: 'IAD', name: 'Washington Dulles International', distance: '42 km from Washington' },
      { code: 'DCA', name: 'Ronald Reagan Washington National', distance: '7 km from Washington' },
      { code: 'BWI', name: 'Baltimore/Washington International', distance: '48 km from Washington' },
    ],
  },
  YTO: {
    cityCode: 'YTO',
    cityName: 'Toronto',
    countryName: 'Canada',
    countryCode: 'CA',
    airports: [
      { code: 'YYZ', name: 'Toronto Pearson International', distance: '22 km from Toronto' },
      { code: 'YTZ', name: 'Billy Bishop Toronto City', distance: '3 km from Toronto' },
    ],
  },
};

const POPULAR_PRIORITY: Record<string, number> = {
  DEL: 5000,
  BOM: 4900,
  BLR: 4800,
  HYD: 4700,
  CCU: 4600,
  MAA: 4500,
  GOI: 4400,
  GOX: 4350,
  AMD: 4300,
  COK: 4200,
  PNQ: 4100,
  JAI: 4000,
  DXB: 4500,
  LHR: 4400,
  SIN: 4300,
  BKK: 4200,
  KUL: 4100,
  DOH: 4000,
  JFK: 3900,
  CDG: 3800,
  LON: 5000,
  NYC: 4500,
  PAR: 4200,
};
