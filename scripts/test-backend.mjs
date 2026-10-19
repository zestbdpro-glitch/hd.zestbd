import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { randomBytes } from 'node:crypto';
import { localConfig, localDirectory, phpBinary, portOpen, root, run, writePhpConfig } from './local-runtime.mjs';

if (await portOpen(8082)) throw new Error('Port 8082 is already in use.');
if (!existsSync('dist/private/bootstrap.php')) await run(process.platform === 'win32' ? 'cmd' : 'npm', process.platform === 'win32' ? ['/c', 'npm', 'run', 'build'] : ['run', 'build']);
const database = `decor_test_${randomBytes(6).toString('hex')}`;
const config = await localConfig(database, 'http://127.0.0.1:8082');
config.rate_limit_max_orders = 5;
const configPath = path.join(localDirectory, `${database}.php`);
await run(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(localDirectory, 'upload-fixture.mp4')]);
await writePhpConfig(configPath, config);
const env = { ...process.env, DECOR_CONFIG_FILE: configPath, DECOR_TEST_SETUP_TOKEN: config.setup_token, PHP_BINARY: phpBinary };
await run(phpBinary, ['scripts/init-local.php'], { env });
const uploadsDirectory = path.join(root, 'dist', 'uploads');
const existingUploads = new Set(await readdir(uploadsDirectory));
const server = spawn(phpBinary, ['-S', '127.0.0.1:8082', '-t', 'dist', 'scripts/test-router.php'], { env, stdio: 'ignore', windowsHide: true });
let exitCode = 0;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await portOpen(8082)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!(await portOpen(8082))) throw new Error('PHP test server did not start.');
  await run(process.platform === 'win32' ? 'cmd' : 'npx', process.platform === 'win32' ? ['/c', 'npx', 'playwright', 'test', '--config', 'playwright.backend.config.js'] : ['playwright', 'test', '--config', 'playwright.backend.config.js'], { env });
} catch (error) {
  console.error(error.message); exitCode = 1;
} finally {
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill(); await stopped;
  await run(phpBinary, ['tests/backend-worker.php'], { env: { ...env, DECOR_TEST_CLEANUP: '1' } });
  for (const file of await readdir(uploadsDirectory)) {
    if (!existingUploads.has(file) && /^[a-f0-9]{32}\.(?:jpg|png|webp|mp4)$/.test(file)) await unlink(path.join(uploadsDirectory, file));
  }
  await unlink(configPath);
}
process.exitCode = exitCode;
