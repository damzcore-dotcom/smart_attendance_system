const { toUTCMidnight } = require('../src/utils/dateHelper');

const d1 = '2026-05-25';
const dateObj1 = new Date(d1);
const target1 = toUTCMidnight(dateObj1);

console.log('Test 1 (2026-05-25):');
console.log('  Input string:', d1);
console.log('  new Date(input):', dateObj1.toISOString());
console.log('  toUTCMidnight:', target1.toISOString());

const d2 = '05/25/2026';
try {
  const dateObj2 = new Date(d2);
  const target2 = toUTCMidnight(dateObj2);
  console.log('Test 2 (05/25/2026):');
  console.log('  Input string:', d2);
  console.log('  new Date(input):', dateObj2.toISOString());
  console.log('  toUTCMidnight:', target2.toISOString());
} catch(e) {
  console.log('Test 2 failed:', e.message);
}
