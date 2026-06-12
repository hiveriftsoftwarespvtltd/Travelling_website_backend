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
        this.logger.log(`Airports collection already seeded with ${count} records.`);
        return;
      }

      this.logger.log('Airports collection is empty. Starting CSV import...');
      const csvFilePath = path.join(process.cwd(), 'data', 'airports.csv');
      
      if (!fs.existsSync(csvFilePath)) {
        this.logger.warn(`CSV file not found at ${csvFilePath}. Skipping import.`);
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
          this.logger.log(`Successfully parsed ${airportsData.length} records. Bulk inserting into MongoDB...`);
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

  async searchAirports(query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const regex = new RegExp(query.trim(), 'i');

    return this.airportModel.find({
      $or: [
        { AIRPORTNAME: { $regex: regex } },
        { AIRPORTCODE: { $regex: regex } },
        { CITYNAME: { $regex: regex } },
        { CITYCODE: { $regex: regex } },
        { COUNTRYCODE: { $regex: regex } },
        { COUNTRYNAME: { $regex: regex } },
      ],
    })
    .limit(15)
    .exec();
  }
}
