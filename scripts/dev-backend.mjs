import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { phpBinary, localDirectory, portOpen } from './local-runtime.mjs';

if (await portOpen(8081)) throw new Error('Port 8081 is already in use.');
const localConfig = path.join(localDirectory, 'config.php');
const environment = { ...process.env };
if (!environment.DECOR_CONFIG_FILE && existsSync(localConfig)) environment.DECOR_CONFIG_FILE = localConfig;
const server = spawn(phpBinary, ['-S', '127.0.0.1:8081', '-t', 'public'], { stdio: 'inherit', windowsHide: true, env: environment });
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.on('exit', (code) => { process.exitCode = code || 0; });
process.on('SIGINT', () => server.kill());
process.on('SIGTERM', () => server.kill());
