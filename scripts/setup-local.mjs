import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { localConfig, localDirectory, phpBinary, run, writePhpConfig } from './local-runtime.mjs';

await run(process.execPath, ['scripts/seed-data.mjs']);
const configPath = path.join(localDirectory, 'config.php');
if (!existsSync(configPath)) {
  const config = await localConfig();
  await writePhpConfig(configPath, config);
  await writeFile(path.join(localDirectory, 'preview-access.json'), JSON.stringify({ email: 'admin@local.test', password: randomBytes(12).toString('hex'), setupToken: config.setup_token }, null, 2));
} else await localConfig();
await run(phpBinary, ['scripts/init-local.php'], { env: { ...process.env, DECOR_CONFIG_FILE: configPath } });
await run(phpBinary, ['scripts/preview-admin.php'], { env: { ...process.env, DECOR_CONFIG_FILE: configPath } });
const access = JSON.parse(await readFile(path.join(localDirectory, 'preview-access.json'), 'utf8'));
console.log('Local preview ready. Administrator login details are in .local/preview-access.json.');
console.log(`Administrator email: ${access.email}`);
