const fetch = require('node-fetch');

async function testApi() {
  try {
    const res = await fetch('http://localhost:5000/api/users');
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testApi();
