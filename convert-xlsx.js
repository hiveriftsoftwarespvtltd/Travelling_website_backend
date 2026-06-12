const xlsx = require('xlsx');
const fs = require('fs');

const workbook = xlsx.readFile('data/airport.xlsx');
const sheetName = workbook.SheetNames[0];
const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);

fs.writeFileSync('data/airports.csv', csv);
console.log('Successfully converted airport.xlsx to airports.csv!');
