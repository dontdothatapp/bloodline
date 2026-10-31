// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [script.js]
// Loads the game in headless Chromium, runs optional page script, saves screenshot, prints console.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'fs';
const [url, out, waitMs = '4000', scriptFile] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: parseInt(process.env.W || 960), height: parseInt(process.env.H || 540) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(parseInt(waitMs));
if (scriptFile) {
  const steps = (await import(new URL(scriptFile, 'file://' + process.cwd() + '/').href)).default;
  await steps(page, out);
}
const stats = await page.evaluate(() => window.__stats ? JSON.stringify(window.__stats) : 'n/a').catch(() => 'n/a');
console.log('stats', stats);
console.log(logs.slice(0, 60).join('\n'));
await page.screenshot({ path: out, timeout: 120000 });
await browser.close();
