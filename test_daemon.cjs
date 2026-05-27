const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const daemonPath = path.join(__dirname, 'native/jepow-cycles/build-cycles-standalone/intern/cycles/app/Blender.app/Contents/MacOS/jepow-cycles-daemon');
const daemon = spawn(daemonPath, ['--stdio']);

daemon.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

daemon.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

daemon.on('close', (code) => {
  console.log('Daemon exited with code', code);
});

const cachePath = '/Users/liang/Library/Application Support/Electron/cycles-cache/cycles-mesh-cycles-1779916298985-1.jpcmesh';
daemon.stdin.write(JSON.stringify({
  cmd: 'load_mesh_cache',
  sessionId: 'test',
  meshCachePath: cachePath,
  width: 800,
  height: 600,
  samples: 1,
  deviceName: 'CPU',
  materialR: 1, materialG: 1, materialB: 1,
  materialRoughness: 0.5, materialMetallic: 0.0, materialEmissionStrength: 0.0,
  transformX: 0, transformY: 0, transformZ: 0,
  transformRx: 0, transformRy: 0, transformRz: 0,
  transformScale: 1
}) + '\n');
