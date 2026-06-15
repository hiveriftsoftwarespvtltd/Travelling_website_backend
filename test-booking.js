const axios = require('axios');

async function run() {
  try {
    const baseURL = 'http://localhost:8009/api/hotel';

    console.log('1. SEARCHING...');
    const searchRes = await axios.post(`${baseURL}/search`, {
      CheckIn: '2026-06-25',
      CheckOut: '2026-06-26',
      CountryCode: 'TH',
      CityId: 110688, // Bangkok
      PaxRooms: [{ Adults: 2, Children: 0 }],
      GuestNationality: 'TH'
    });
    
    const searchData = searchRes.data.GetHotelResultResponse;
    const traceId = searchData.TraceId;
    const hotel = searchData.HotelResults.find(h => !h.IsPackageFare && h.StarRating >= 3) || searchData.HotelResults[0];
    if (!hotel) throw new Error('No hotels found');

    const resultIndex = hotel.ResultIndex;
    const hotelCode = hotel.HotelCode;
    console.log(`Search success! TraceId: ${traceId}, HotelCode: ${hotelCode}, HotelName: ${hotel.HotelName}`);

    console.log('\n2. GET HOTEL ROOMS...');
    const roomRes = await axios.post(`${baseURL}/rooms`, {
      TraceId: traceId,
      ResultIndex: resultIndex,
      HotelCode: hotelCode
    });
    const roomList = roomRes.data.GetHotelRoomResult.HotelRoomsDetails;
    
    for (const selectedRoom of roomList) {
      console.log(`\n--- TRYING RoomIndex: ${selectedRoom.RoomIndex}, RatePlanCode: ${selectedRoom.RatePlanCode} ---`);
      
      console.log('3. PRE-BOOKING...');
      try {
        const preBookRes = await axios.post(`${baseURL}/pre-book`, {
          TraceId: traceId,
          ResultIndex: resultIndex,
          HotelCode: hotelCode,
          BookingCode: selectedRoom.RatePlanCode,
          RoomTypeCode: selectedRoom.RoomTypeCode,
          RoomTypeName: selectedRoom.RoomTypeName,
          RoomIndex: selectedRoom.RoomIndex,
          Price: selectedRoom.Price,
          RoomGuests: [{ NoOfAdults: 2, NoOfChild: 0, ChildAge: null }],
          NoOfRooms: 1
        });

        console.log('4. BOOKING...');
        const bookPayload = {
          TraceId: traceId,
          ResultIndex: resultIndex,
          HotelCode: hotelCode,
          IsVoucherBooking: true,
          IspackageFare: true,
          GuestNationality: 'IN',
          NoOfRooms: 1,
          NetAmount: selectedRoom.Price.PublishedPrice,
          HotelRoomsDetails: [
            {
              RoomIndex: selectedRoom.RoomIndex,
              RoomTypeCode: selectedRoom.RoomTypeCode,
              RoomTypeName: selectedRoom.RoomTypeName,
              RatePlanCode: selectedRoom.RatePlanCode,
              Price: selectedRoom.Price,
              BedTypeCode: null,
              SmokingPreference: 0,
              Supplements: null,
              HotelPassenger: [
                {
                  Title: 'Mr',
                  FirstName: 'Test',
                  LastName: 'UserOne',
                  PaxType: 1,
                  LeadPassenger: true,
                  Age: 30,
                  Email: 'test@example.com',
                  Phoneno: '9999999999',
                  CountryCode: 'IN',
                  CountryName: 'India'
                },
                {
                  Title: 'Mr',
                  FirstName: 'Test',
                  LastName: 'UserTwo',
                  PaxType: 1,
                  LeadPassenger: false,
                  Age: 30,
                  Email: 'test@example.com',
                  Phoneno: '9999999999',
                  CountryCode: 'IN',
                  CountryName: 'India'
                }
              ]
            }
          ]
        };
        
        const bookRes = await axios.post(`${baseURL}/book`, bookPayload);
        const errCode = bookRes.data?.BookResult?.Error?.ErrorCode || bookRes.data?.details?.BookResult?.Error?.ErrorCode;
        console.log('Book Response Code:', errCode || 'SUCCESS!');
        if (!errCode || errCode === 0) {
           console.log('BOOKING WORKED!!', JSON.stringify(bookRes.data, null, 2));
           break;
        } else {
           console.log('Error:', bookRes.data?.BookResult?.Error?.ErrorMessage || bookRes.data?.details?.BookResult?.Error?.ErrorMessage);
        }
      } catch (e) {
         console.log('Exception details:', JSON.stringify(e.response?.data, null, 2) || e.message);
      }
    }
  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
  }
}
run();
