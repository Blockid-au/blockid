#!/usr/bin/env node
// AI Worker — runs OUTSIDE Next.js to bypass Turbopack fetch patches.
// Called via child_process from ai-client.ts
// Input: JSON on stdin { url, headers, body }
// Output: response body on stdout

import https from 'https';

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const { url, headers, body } = JSON.parse(input);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 180000,
    }, res => {
      let data = '';
      res.on('data', c => { data += c.toString(); });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          process.stderr.write(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
          process.exit(1);
        }
        process.stdout.write(data);
      });
    });
    req.on('error', e => { process.stderr.write(e.message); process.exit(1); });
    req.on('timeout', () => { req.destroy(); process.stderr.write('timeout'); process.exit(1); });
    req.write(body);
    req.end();
  } catch (e) {
    process.stderr.write(`[ai-worker] ${e.message}\nInput: ${input.slice(0, 200)}`);
    process.exit(1);
  }
});
