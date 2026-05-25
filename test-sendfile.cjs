const express = require('express');
const path = require('path');
const os = require('os');
const app = express();

app.get('/', (req, res) => {
  const filepath = path.join(os.homedir(), 'test-express-sendfile.txt');
  require('fs').writeFileSync(filepath, 'success from outside');
  res.sendFile(filepath, (err) => {
    if (err) {
      console.log('Error:', err);
      res.status(500).send(err.message);
    }
  });
});

const server = app.listen(3001, () => {
  require('http').get('http://localhost:3001/', (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      console.log('Result:', raw);
      server.close();
    });
  });
});
