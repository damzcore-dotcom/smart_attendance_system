const crypto = require('crypto');

// ⚠️ WARNING: Keep this secret safe! Do not share it with clients.
// In a real production system, store this in a secure vault or environment variable.
const MASTER_SECRET = 'IGA_SUPER_SECRET_KEY_2026_DO_NOT_SHARE';

function generateLicense(clientName, expiryDateStr, maxEmployees) {
  const payload = {
    client: clientName,
    expiry: expiryDateStr,
    limit: maxEmployees
  };
  
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  
  // Create signature
  const hmac = crypto.createHmac('sha256', MASTER_SECRET);
  hmac.update(payloadBase64);
  const signature = hmac.digest('hex');
  
  // Combine into a single key
  return `${payloadBase64}.${signature}`;
}

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('❌ Usage: node generate-license.js "Client Name" "YYYY-MM-DD" MaxEmployees');
  console.log('   Example: node generate-license.js "PT ABC" "2027-05-16" 100');
  process.exit(1);
}

const client = args[0];
const expiry = args[1];
const maxEmp = parseInt(args[2]);

const key = generateLicense(client, expiry, maxEmp);

console.log('\n===================================================');
console.log('🔐 LICENSE KEY GENERATOR');
console.log('===================================================');
console.log(`Client Name   : ${client}`);
console.log(`Expiry Date   : ${expiry}`);
console.log(`Max Employees : ${maxEmp}`);
console.log('===================================================');
console.log('\nGive this key to the client:\n');
console.log(key);
console.log('\n===================================================\n');
