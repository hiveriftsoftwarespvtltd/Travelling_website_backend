const axios = require('axios');

async function testTBO() {
  try {
    const authRes = await axios.post('http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate', {
      ClientId: 'ApiIntegrationNew',
      UserName: 'Lifejiyo',
      Password: 'Lifejiyo@123',
      EndUserIp: '127.0.0.1'
    });
    console.log('Auth:', authRes.data);

    if (authRes.data.Status !== 1) return;
    const token = authRes.data.TokenId;

    const payload = {
      EndUserIp: '127.0.0.1',
      TokenId: token,
      AdultCount: 1,
      ChildCount: 0,
      InfantCount: 0,
      DirectFlight: false,
      OneStopFlight: false,
      JourneyType: 3,
      PreferredAirlines: null,
      Segments: [{
        Origin: 'DEL',
        Destination: 'BOM',
        FlightCabinClass: 1,
        PreferredDepartureTime: '2026-08-15T00:00:00',
        PreferredArrivalTime: '2026-08-15T00:00:00'
      }, {
        Origin: 'BOM',
        Destination: 'BLR',
        FlightCabinClass: 1,
        PreferredDepartureTime: '2026-08-18T00:00:00',
        PreferredArrivalTime: '2026-08-18T00:00:00'
      }],
      Sources: null
    };
    
    console.log('Searching...');
    const searchRes = await axios.post('http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/Search', payload, {timeout: 45000});
    console.log('Search Result:', JSON.stringify(searchRes.data));
  } catch (e) {
    console.error('Error:', e?.response?.data || e.message);
  }
}

testTBO();
