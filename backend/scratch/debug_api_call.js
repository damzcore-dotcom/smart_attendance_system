const fetch = require('node-fetch');

async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password' }) // Assuming default
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;

  console.log('Got token, fetching permissions for user ID 1...');
  const res = await fetch('http://localhost:5000/api/users/1/permissions', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Data:', JSON.stringify(data, null, 2));
}

test();
