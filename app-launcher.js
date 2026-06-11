const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const net = require('net');

let backendProcess = null;
let frontendProcess = null;
let systemLogs = [];
let backendLogs = [];
let frontendLogs = [];

// Parse ports dynamically from configurations
const envPath = path.join(__dirname, 'backend', '.env');
const frontendEnvPath = path.join(__dirname, 'frontend', '.env');

let dbHost = '127.0.0.1';
let dbPort = 5432;
let backendPort = 5000;
let frontendPort = 5173;
let aiPort = 8002;

function loadConfigurations() {
  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      // Parse database port
      const dbMatch = envContent.match(/DATABASE_URL=["']?postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^"'\s]+)["']?/);
      if (dbMatch) {
        dbHost = dbMatch[3];
        dbPort = parseInt(dbMatch[4], 10);
      }
      
      // Parse backend port
      const portMatch = envContent.match(/^PORT=(\d+)/m);
      if (portMatch) {
        backendPort = parseInt(portMatch[1], 10);
      }
    }

    if (fs.existsSync(frontendEnvPath)) {
      const envContent = fs.readFileSync(frontendEnvPath, 'utf8');
      
      // Parse frontend port
      const portMatch = envContent.match(/^VITE_PORT=(\d+)/m);
      if (portMatch) {
        frontendPort = parseInt(portMatch[1], 10);
      }
      
      // Parse AI Engine port
      const aiMatch = envContent.match(/^VITE_AI_ENGINE_URL=["']?https?:\/\/[^:]+:(\d+)/m);
      if (aiMatch) {
        aiPort = parseInt(aiMatch[1], 10);
      }
    }
  } catch (e) {
    logSystem(`Gagal memuat konfigurasi: ${e.message}`);
  }
}

// Function to check if a port is open
function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

function logSystem(msg) {
  const timestamp = new Date().toLocaleTimeString('id-ID');
  systemLogs.push(`[${timestamp}] [SYSTEM] ${msg}\n`);
  if (systemLogs.length > 500) systemLogs.shift();
}

function startBackend() {
  if (backendProcess) return;
  logSystem('Menyalakan Backend Server (node dist/index.js)...');
  
  backendProcess = spawn('node', ['dist/index.js'], { 
    cwd: path.join(__dirname, 'backend'),
    env: { ...process.env }
  });
  
  backendProcess.stdout.on('data', (data) => {
    backendLogs.push(data.toString());
    if (backendLogs.length > 800) backendLogs.shift();
  });
  
  backendProcess.stderr.on('data', (data) => {
    backendLogs.push(`[ERROR] ${data.toString()}`);
    if (backendLogs.length > 800) backendLogs.shift();
  });

  backendProcess.on('close', (code) => {
    logSystem(`Backend Server terhenti dengan kode keluar: ${code}`);
    backendProcess = null;
  });
}

function startFrontend() {
  if (frontendProcess) return;
  logSystem(`Menyalakan Frontend Server (npx serve -s dist -l ${frontendPort})...`);
  
  if (process.platform === 'win32') {
    frontendProcess = spawn('cmd.exe', ['/d', '/s', '/c', `npx -y serve -s dist -l ${frontendPort}`], { 
      cwd: path.join(__dirname, 'frontend'),
      shell: false
    });
  } else {
    frontendProcess = spawn('npx', ['-y', 'serve', '-s', 'dist', '-l', frontendPort.toString()], { 
      cwd: path.join(__dirname, 'frontend')
    });
  }
  
  frontendProcess.stdout.on('data', (data) => {
    frontendLogs.push(data.toString());
    if (frontendLogs.length > 800) frontendLogs.shift();
  });
  
  frontendProcess.stderr.on('data', (data) => {
    frontendLogs.push(`[ERROR] ${data.toString()}`);
    if (frontendLogs.length > 800) frontendLogs.shift();
  });

  frontendProcess.on('close', (code) => {
    logSystem(`Frontend Server terhenti dengan kode keluar: ${code}`);
    frontendProcess = null;
  });
}

function stopAll() {
  logSystem('Mengirim sinyal stop ke semua layanan...');
  
  if (backendProcess) {
    logSystem('Menghentikan server Backend...');
    // Kill child process on Windows
    exec(`taskkill /pid ${backendProcess.pid} /f /t`, () => {
      backendProcess = null;
    });
  }
  
  if (frontendProcess) {
    logSystem('Menghentikan server Frontend...');
    exec(`taskkill /pid ${frontendProcess.pid} /f /t`, () => {
      frontendProcess = null;
    });
  }
}

// Clean up processes on exit
process.on('exit', () => {
  stopAll();
});
process.on('SIGINT', () => {
  stopAll();
  process.exit();
});

// Load config settings
loadConfigurations();

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Serve UI Page
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const uiPath = path.join(__dirname, 'launcher-ui.html');
    if (fs.existsSync(uiPath)) {
      res.end(fs.readFileSync(uiPath));
    } else {
      res.end('<h1>Error: File launcher-ui.html tidak ditemukan!</h1>');
    }
  } 
  // API endpoints
  else if (req.url === '/api/status') {
    const dbOnline = await checkPort(dbPort, dbHost);
    const backendOnline = await checkPort(backendPort);
    const frontendOnline = await checkPort(frontendPort);
    const aiOnline = await checkPort(aiPort);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      database: dbOnline ? 'online' : 'offline',
      backend: backendOnline ? 'online' : 'offline',
      frontend: frontendOnline ? 'online' : 'offline',
      aiEngine: aiOnline ? 'online' : 'offline',
      systemActive: (backendProcess !== null || frontendProcess !== null),
      config: {
        dbPort,
        backendPort,
        frontendPort,
        aiPort
      }
    }));
  }
  else if (req.url === '/api/start') {
    startBackend();
    // Give backend a small headstart
    setTimeout(() => {
      startFrontend();
    }, 1500);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }
  else if (req.url === '/api/stop') {
    stopAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }
  else if (req.url === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      system: systemLogs.join(''),
      backend: backendLogs.join(''),
      frontend: frontendLogs.join('')
    }));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const LAUNCHER_PORT = 8000;
server.listen(LAUNCHER_PORT, '127.0.0.1', () => {
  console.log(`===================================================`);
  console.log(`  🚀 Smart HRIS Platform Launcher is running...`);
  console.log(`  🔗 Launcher URL: http://localhost:${LAUNCHER_PORT}`);
  console.log(`===================================================`);
  console.log(`Starting desktop interface...`);
  
  logSystem(`Launcher server aktif di http://localhost:${LAUNCHER_PORT}`);
  
  // Launch MS Edge or Chrome in App Mode
  logSystem('Membuka antarmuka desktop (App Mode)...');
  const appUrl = `http://localhost:${LAUNCHER_PORT}`;
  
  // Try Microsoft Edge in App Mode first
  exec(`start msedge --app=${appUrl} --window-size=1020,720`, (err) => {
    if (err) {
      // Fallback to Google Chrome
      exec(`start chrome --app=${appUrl} --window-size=1020,720`, (err2) => {
        if (err2) {
          // Open default browser as normal tab
          exec(`start ${appUrl}`);
        }
      });
    }
  });
});
