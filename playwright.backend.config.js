import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/backend.spec.js', workers: 1,
  fullyParallel: false, timeout: 45000, reporter: [['list']],
  outputDir: 'test-results/backend',
  use: { baseURL: 'http://127.0.0.1:8082', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
