const http = require('http');

http.get('http://localhost:3000/api/health', (res) => {
  console.log('Health:', res.statusCode);
});

http.get('http://localhost:3000/api/image?f=missing.jpg', (res) => {
  console.log('Image status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Image data:', data));
});
