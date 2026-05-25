const http = require('http');

http.get('http://localhost:3000/api/image?f=1778158910430-892984674.jpg', (res) => {
  console.log('Status code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = Buffer.alloc(0);
  res.on('data', d => data = Buffer.concat([data, d]));
  res.on('end', () => console.log('Data length:', data.length));
});
