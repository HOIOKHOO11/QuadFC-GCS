// Pure Node static file server — no Electron imports, so it can be unit-tested
// with plain node/bun. Inside the packaged app, `root` lives inside the asar
// archive; Electron patches fs so readFile works transparently.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// resolve a URL path to a file inside root (path-traversal safe)
function resolveFile(root, urlPath) {
  let p = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (p.includes('..')) return null;
  let file = path.join(root, p);
  if (!path.extname(file)) file = path.join(file, 'index.html'); // pretty route → out/<route>/index.html or out/index.html
  return file;
}

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const file = resolveFile(root, req.url);
      if (!file) { res.writeHead(400); res.end('bad request'); return; }
      fs.readFile(file, (err, data) => {
        if (err) {
          // SPA fallback: serve the root index for unknown routes
          fs.readFile(path.join(root, 'index.html'), (err2, idx) => {
            if (err2) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(idx);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, server }));
  });
}

module.exports = { startStaticServer, resolveFile };
