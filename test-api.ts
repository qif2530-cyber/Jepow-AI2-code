import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/auth/send-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000' })
  });
  const data = await res.json();
  console.log(data);
}
test();
