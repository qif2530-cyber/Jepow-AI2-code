const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

http.get('http://localhost:3000/api/health', (res) => console.log('health', res.statusCode));

// Let's find out what the server thinks UPLOADS_DIR is.
http.get('http://localhost:3000/api/debug/uploads', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('UPLOADS_DIR is:', data));
});
