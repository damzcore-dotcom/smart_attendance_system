const { execSync } = require('child_process');
const fs = require('fs');

try {
  console.log('Starting prisma generate...');
  const output = execSync('npx prisma generate', { encoding: 'utf8' });
  console.log('Output:', output);
  fs.writeFileSync('scratch/generate_success.txt', output);
} catch (err) {
  console.error('Error occurred:');
  console.error(err.stdout);
  console.error(err.stderr);
  fs.writeFileSync('scratch/generate_error.txt', err.stdout + '\n' + err.stderr);
}
