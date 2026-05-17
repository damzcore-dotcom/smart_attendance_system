const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('===================================================');
console.log('🏢 SMART ATTENDANCE PRO - CLIENT SETUP SCRIPT 🏢');
console.log('===================================================\n');

rl.question('Enter PostgreSQL Database URL (e.g. postgresql://user:pass@localhost:5432/dbname): ', (dbUrl) => {
  if (!dbUrl) {
    console.error('❌ Database URL is required!');
    rl.close();
    process.exit(1);
  }

  // Generate secure JWT Secret
  const jwtSecret = crypto.randomBytes(64).toString('hex');
  
  // Create / overwrite backend/.env
  const envPath = path.join(__dirname, 'backend', '.env');
  const envContent = `PORT=5000\nDATABASE_URL="${dbUrl}"\nJWT_SECRET="${jwtSecret}"\n`;

  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Environment configuration created successfully!');
  console.log('   Location: backend/.env');
  console.log('   JWT_SECRET: [Auto-Generated Secure Key]');
  
  console.log('\n===================================================');
  console.log('NEXT STEPS:');
  console.log('1. Navigate to the backend folder: cd backend');
  console.log('2. Run database migration: npx prisma migrate deploy');
  console.log('3. Seed initial data: node src/seed.js');
  console.log('===================================================\n');
  
  rl.close();
});
