const fs = require('fs');
const path = require('path');

const filePath = path.join('d:', 'Travelling_Backend', 'src', 'flight', 'flight.service.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const methods = [
    { name: 'searchFlights', params: '(searchDto, endUserIp)' },
    { name: 'getCalendarFare', params: '(searchDto, endUserIp)' },
    { name: 'updateCalendarFareOfDay', params: '(searchDto, endUserIp)' },
    { name: 'getFareUpsell', params: '(reqBody, endUserIp)' },
    { name: 'getFareRule', params: '(reqBody, endUserIp)' },
    { name: 'getFareQuote', params: '(reqBody, endUserIp)' },
    { name: 'getSSR', params: '(reqBody, endUserIp)' },
    { name: 'bookFlight', params: '(reqBody, endUserIp)' },
    { name: 'ticketFlight', params: '(reqBody, endUserIp)' },
];

methods.forEach(method => {
    // Regex to find:
    // const tboError = data?.Response?.Error;
    // this.logger.error('...', tboError);
    // (optional if)
    
    // Actually, let's just search for `const tboError = data?.Response?.Error;` inside the method and insert the retry block right after the logger.error line.
    
    const searchRegex = new RegExp(`(this\\.logger\\.(?:error|warn)\\([^\\)]*tboError[^\\)]*\\);)`, 'g');
    
    // We only want to replace it within the specific method's try block. A safe way is to find the function, then find the first match of the search string.
    let startIdx = content.indexOf(`async ${method.name}(`);
    if (startIdx === -1) {
        console.error(`Method ${method.name} not found!`);
        return;
    }
    
    let errorLogIdx = content.indexOf('const tboError = data?.Response?.Error;', startIdx);
    if (errorLogIdx === -1) return;
    
    let endOfLogIdx = content.indexOf(');', errorLogIdx + 30) + 2;
    
    let before = content.substring(0, endOfLogIdx);
    let after = content.substring(endOfLogIdx);
    
    // Avoid double patching
    if (!after.trim().startsWith('if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED')) {
        const retryBlock = `\n        if (tboError?.ErrorCode === TBO_ERROR_TOKEN_EXPIRED || tboError?.ErrorCode === TBO_ERROR_INVALID_TOKEN) {
          this.logger.warn('⚠️ TBO token expired/invalid. Clearing cache and retrying...');
          this.cachedToken = null;
          this.tokenExpiry = 0;
          return this.${method.name}${method.params};
        }`;
        content = before + retryBlock + after;
    }
});

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Patched flight.service.ts successfully');
