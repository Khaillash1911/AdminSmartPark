import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const gatewayPort = process.env.AI_GATEWAY_PORT || '8000';
const pythonCandidates = process.platform === 'win32'
  ? [path.join(root, '.venv', 'Scripts', 'python.exe'), 'python']
  : [path.join(root, '.venv', 'bin', 'python'), 'python3', 'python'];
const python = pythonCandidates.find(candidate => !candidate.includes(path.sep) || existsSync(candidate));
const cloudflared = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
const children = new Map();
let publicUrl = '';
let shuttingDown = false;

function fail(message) {
  console.error(`\n[AI TUNNEL] ${message}\n`);
  process.exit(1);
}

if (!python) fail('Python was not found. Create .venv or add Python to PATH.');
if (spawnSync(cloudflared, ['--version'], { stdio: 'ignore' }).error) {
  const install = process.platform === 'darwin'
    ? 'brew install cloudflared'
    : process.platform === 'win32'
      ? 'winget install --id Cloudflare.cloudflared'
      : 'Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
  fail(`cloudflared is not installed. Install it with:\n  ${install}`);
}

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.set(label, child);
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.on('data', chunk => output.write(`[${label}] ${chunk}`));
  }
  child.on('exit', (code, signal) => {
    children.delete(label);
    if (!shuttingDown) {
      console.error(`[${label}] stopped unexpectedly (${signal || code})`);
      void shutdown(1);
    }
  });
  return child;
}

async function waitForHealth(url, label, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const child = children.get(label);
    if (!child || child.exitCode !== null) throw new Error(`${label} stopped before becoming healthy`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error(`${label} did not become healthy within ${timeoutMs / 1000} seconds`);
}

function updateRuntime(status, url = '') {
  return new Promise(resolve => {
    const args = ['scripts/update_ai_runtime.py', status];
    if (url) args.push('--url', url);
    const updater = spawn(python, args, { cwd: root, env: process.env, stdio: 'inherit' });
    updater.on('exit', code => resolve(code === 0));
    updater.on('error', () => resolve(false));
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (publicUrl) await Promise.race([
    updateRuntime('offline'),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL');
  }, 4000).unref();
  process.exitCode = exitCode;
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

try {
  start('YOLO', python, ['detection/parking_detector_api.py']);
  start('OCR', python, ['find_my_car_system/backend/find_my_car_api.py']);
  await Promise.all([
    waitForHealth('http://127.0.0.1:5050/health', 'YOLO'),
    waitForHealth('http://127.0.0.1:5002/', 'OCR')
  ]);

  start('GATEWAY', python, ['-m', 'backend.ai_gateway']);
  await waitForHealth(`http://127.0.0.1:${gatewayPort}/health`, 'GATEWAY', 30000);

  const tunnel = start('TUNNEL', cloudflared, ['tunnel', '--url', `http://127.0.0.1:${gatewayPort}`, '--no-autoupdate']);
  const detectUrl = chunk => {
    const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match || publicUrl) return;
    publicUrl = match[0];
    console.log(`\n${'='.repeat(72)}\nSMARTPARK AI PUBLIC URL: ${publicUrl}\nLocal gateway: http://127.0.0.1:${gatewayPort}\n${'='.repeat(72)}\n`);
    void updateRuntime('online', publicUrl).then(updated => {
      if (!updated) console.error('[RUNTIME] Could not update Firestore. The URL above must be set manually in system_config/ai_api.');
    });
  };
  tunnel.stdout.on('data', detectUrl);
  tunnel.stderr.on('data', detectUrl);
} catch (error) {
  console.error(`[AI TUNNEL] ${error.message}`);
  await shutdown(1);
}
