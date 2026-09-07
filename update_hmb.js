const fs = require('fs');

const path = 'd:\\jiyo_life_travels\\Travelling_Frontend\\src\\Pages\\HotelMyBookings.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add cancel handler
const cancelCode = `
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking? Cancellation charges may apply as per hotel policy.')) return;
    
    try {
      setLoading(true);
      const res = await fetch(\`\${HOTEL_API}/cancel-booking\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ BookingId: bookingId, RequestType: 1, Remarks: "Customer requested cancellation" })
      });
      
      if (!res.ok) throw new Error('Failed to send cancellation request');
      alert('Cancellation request sent successfully. We will process it and update the status shortly.');
      
      // Refresh list
      fetchBookings(authData.email, authData.phone, authData.userId);
    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };
`;
content = content.replace('const handleLogout = () => {', cancelCode + '\n  const handleLogout = () => {');

// 2. Update CSS for the card
const oldCss = `.hmb-card { background: #fff; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 16px; transition: transform 0.2s; cursor: pointer; }`;
const newCss = `.hmb-card { background: #fff; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 16px; transition: all 0.3s ease; }
        .hmb-card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(0,0,0,0.1); border-color: #cbd5e1; }
        .hmb-actions { display: flex; gap: 12px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 16px; justify-content: flex-end; }
        .hmb-btn-outline { padding: 8px 16px; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; color: #1e293b; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; }
        .hmb-btn-outline:hover { background: #f8fafc; border-color: #cbd5e1; }
        .hmb-btn-danger { padding: 8px 16px; border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; color: #dc2626; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; }
        .hmb-btn-danger:hover { background: #fee2e2; border-color: #fca5a5; }
        .hmb-btn-primary { padding: 8px 16px; border: none; background: #e8151b; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; }
        .hmb-btn-primary:hover { background: #c8101a; box-shadow: 0 4px 12px rgba(232,21,27,0.2); }`;
content = content.replace(oldCss, newCss);

// Remove cursor pointer hover effect on the old card
content = content.replace(`.hmb-card:hover { transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.08); border-color: #cbd5e1; }`, ``);

// 3. Update the Card DOM structure
const oldCardRegex = /<div className="hmb-card".*?onClick=\{.*?\}\s*>/s;
const newCardStart = `<div className="hmb-card" key={booking._id}>`;
content = content.replace(oldCardRegex, newCardStart);

// Format amount paid and add action buttons
const amountRegex = /₹\{booking\.fareDetails\?\.NetAmount\?\.toLocaleString\(\) \|\| 0\}/g;
content = content.replace(amountRegex, `₹{Math.round(booking.fareDetails?.NetAmount || 0).toLocaleString()}`);

// Add action buttons before the closing </div> of the card
const actionButtons = `
                    <div className="hmb-actions">
                      {booking.status === 'CONFIRMED' && (
                        <button className="hmb-btn-danger" onClick={(e) => { e.stopPropagation(); handleCancelBooking(booking.bookingId); }}>
                          Cancel Booking
                        </button>
                      )}
                      <button className="hmb-btn-primary" onClick={() => navigate('/hotel-confirmation', { state: { bookingId: booking.bookingId, bookResult: { Status: { Description: booking.status }, ConfirmationNo: booking.confirmationNo }, hotel: booking.hotelDetails, selectedRoom: booking.roomDetails, contactEmail: authData.email, contactPhone: authData.phone, voucherData: booking.voucherDetails } })}>
                        View Details
                      </button>
                    </div>
                  </div>
                );`;
                
// Find the exact place to inject the action buttons. It's before the closing div of the card inside the map.
// The map looks like this: return ( <div className="hmb-card"> ... </div> );
content = content.replace(/<\/div>\s*\);\s*\}\)\}\s*<\/div>/, actionButtons.replace(/                  <\/div>\n                \);\s*$/, '') + '\n                  </div>\n                );\n              })}\n            </div>');

fs.writeFileSync(path, content);
console.log("Updated HotelMyBookings.jsx");
