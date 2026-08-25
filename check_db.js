const mongoose = require('mongoose');

async function checkCity() {
  await mongoose.connect('mongodb://127.0.0.1:27017/jiyo_life_travels');
  console.log('Connected');
  
  const db = mongoose.connection.db;
  const hotelProperties = db.collection('hotelproperties');
  
  const countString = await hotelProperties.countDocuments({ CityId: "115936" });
  const countNumber = await hotelProperties.countDocuments({ CityId: 115936 });
  const countTotal = await hotelProperties.countDocuments();
  
  console.log('Total properties in DB:', countTotal);
  console.log('String CityId 115936:', countString);
  console.log('Number CityId 115936:', countNumber);
  
  const sample = await hotelProperties.findOne({});
  console.log('Sample property:', sample);
  
  process.exit();
}

checkCity();
