#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

const EXTERNAL_PORT = Number(process.env.PORT) || 3000;
const INTERNAL_PORT = 4200;
const INTERNAL_HOST = '127.0.0.1';

let child = null;
let childMode = null; // 'ssr' | 'ng-serve'
let shuttingDown = false;
let pausedForBuild = false;
let manualPauseUntil = 0;
const startupTime = Date.now();

function isExternalBuildRunning() {
  if (Date.now() < manualPauseUntil) return true;
  try {
    const entries = fs.readdirSync('/proc');
    for (let i = 0; i < entries.length; i++) {
      const pid = entries[i];
      if (pid[0] < '0' || pid[0] > '9') continue;
      const numPid = Number(pid);
      if (numPid === process.pid || (child && numPid === child.pid)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (
          cmdline &&
          (cmdline.includes('ng.js\0build') ||
            cmdline.includes('/ng\0build') ||
            cmdline.includes('bun\0run\0build') ||
            cmdline.includes('bun\0run\0lint') ||
            cmdline.includes('typescript/bin/tsc') ||
            (cmdline.includes('@angular/cli') && cmdline.includes('\0build')))
        ) {
          return true;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return false;
}

function forceKillDevProcesses() {
  if (child) {
    try {
      child.kill('SIGKILL');
    } catch (e) {}
    child = null;
    childMode = null;
  }
  try {
    execSync('pkill -9 -f "ng serve" 2>/dev/null || true');
    execSync('pkill -9 -f "dist/app/server/server.mjs" 2>/dev/null || true');
  } catch (e) {}
}

function startBackendServer() {
  if (shuttingDown || child || pausedForBuild) return;

  if (isExternalBuildRunning()) {
    setTimeout(startBackendServer, 500);
    return;
  }

  const builtServer = path.join(__dirname, 'dist', 'app', 'server', 'server.mjs');
  const ngJs = path.join(__dirname, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

  if (fs.existsSync(builtServer)) {
    childMode = 'ssr';
    child = spawn(process.execPath, [builtServer], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(INTERNAL_PORT),
        START_EXPRESS_SERVER: 'true',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
    });
  } else {
    if (!fs.existsSync(ngJs) || (process.env.START_EXPRESS_SERVER !== 'true' && Date.now() - startupTime < 90000)) {
      setTimeout(startBackendServer, 2000);
      return;
    }
    childMode = 'ng-build';
    const args = [ngJs, 'build'];
    child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=1024',
      },
    });
  }

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk.toString());
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  child.on('error', (err) => {
    console.error('[dev-server] Backend process error:', err.message);
  });

  child.on('exit', () => {
    child = null;
    childMode = null;
    if (!shuttingDown && !pausedForBuild) {
      setTimeout(startBackendServer, 500);
    }
  });
}

setInterval(() => {
  if (shuttingDown) return;
  const building = isExternalBuildRunning();
  if (building && !pausedForBuild) {
    pausedForBuild = true;
    console.log('[dev-server] Pausing backend during external build/lint...');
    forceKillDevProcesses();
  } else if (!building && pausedForBuild) {
    pausedForBuild = false;
    console.log('[dev-server] External build/lint finished, starting SSR server...');
    startBackendServer();
  }
}, 250).unref();

startBackendServer();

function checkBackendOpen(cb) {
  const socket = net.connect(INTERNAL_PORT, INTERNAL_HOST);
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    socket.destroy();
    cb(ok);
  };
  socket.setTimeout(600);
  socket.on('connect', () => finish(true));
  socket.on('timeout', () => finish(false));
  socket.on('error', () => finish(false));
}

const WARMUP_HTML = `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Запуск застосунку...</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #090d16;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .card {
      text-align: center;
      padding: 32px 28px;
      border-radius: 16px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.15);
      max-width: 380px;
    }
    .spinner {
      width: 36px;
      height: 36px;
      margin: 0 auto 16px;
      border: 3px solid rgba(56, 189, 248, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 16px; margin: 0 0 8px; font-weight: 600; }
    p { font-size: 13px; margin: 0; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Запуск сервера застосунку…</h1>
    <p>Зачекайте кілька секунд, сторінка відкриється автоматично.</p>
  </div>
  <script>
    try {
      sessionStorage.removeItem('warmup_start_time');
      sessionStorage.removeItem('warmup_last_reload_time');
      sessionStorage.removeItem('warmup_failed_sent');
    } catch (e) {}
    async function poll() {
      try {
        const res = await fetch('/__ready__', { cache: 'no-store' });
        const data = await res.json();
        if (data && data.ready) {
          window.location.reload();
          return;
        }
      } catch (e) {}
      setTimeout(poll, 1200);
    }
    setTimeout(poll, 1000);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/__pause__') {
    manualPauseUntil = Date.now() + 45000;
    pausedForBuild = true;
    forceKillDevProcesses();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ paused: true }));
    return;
  }

  if (req.url === '/__resume__') {
    manualPauseUntil = 0;
    pausedForBuild = false;
    startBackendServer();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ paused: false }));
    return;
  }

  if (req.url === '/__ready__') {
    checkBackendOpen((ok) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ ready: ok }));
    });
    return;
  }

  const forwardedHeaders = { ...req.headers };
  delete forwardedHeaders['x-forwarded-host'];
  delete forwardedHeaders['x-forwarded-server'];
  forwardedHeaders.host = `localhost:${INTERNAL_PORT}`;

  if (req.url && req.url.startsWith('/api/')) {
    const bodyChunks = [];
    req.on('data', (chunk) => bodyChunks.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(bodyChunks);
      const attemptApiProxy = (attempt) => {
        const apiProxyReq = http.request(
          {
            hostname: INTERNAL_HOST,
            port: INTERNAL_PORT,
            path: req.url,
            method: req.method,
            headers: forwardedHeaders,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );

        apiProxyReq.on('error', () => {
          if (res.headersSent) {
            res.end();
            return;
          }
          if (attempt < 20) {
            setTimeout(() => attemptApiProxy(attempt + 1), 300);
            return;
          }
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Сервер тимчасово перезавантажується, спробуйте за секунду.' }));
        });

        if (bodyBuffer.length > 0) {
          apiProxyReq.write(bodyBuffer);
        }
        apiProxyReq.end();
      };

      attemptApiProxy(0);
    });
    return;
  }

  const proxyReq = http.request(
    {
      hostname: INTERNAL_HOST,
      port: INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers: forwardedHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    });
    res.end(WARMUP_HTML);
  });

  req.pipe(proxyReq);
});

server.on('upgrade', (req, socket, head) => {
  const proxySocket = net.connect(INTERNAL_PORT, INTERNAL_HOST, () => {
    const reqLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      reqLines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    reqLines.push('', '');
    proxySocket.write(reqLines.join('\r\n'));
    if (head && head.length) {
      proxySocket.write(head);
    }
    socket.pipe(proxySocket).pipe(socket);
  });

  proxySocket.on('error', () => {
    socket.destroy();
  });
  socket.on('error', () => {
    proxySocket.destroy();
  });
});

server.listen(EXTERNAL_PORT, '0.0.0.0', () => {
  console.log(`[dev-server] Proxy listening on http://0.0.0.0:${EXTERNAL_PORT} -> http://${INTERNAL_HOST}:${INTERNAL_PORT}`);
});

function shutdown() {
  shuttingDown = true;
  forceKillDevProcesses();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
