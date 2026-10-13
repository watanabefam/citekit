// Live-browser pass for CiteKit — the check this project has been missing.
// Loads the real page in Chromium, drives the real UI, asserts no console/page
// errors, checks the responsive layout, and saves screenshots for visual review.
//
// Needs no npm install: uses the globally-installed playwright-core and the cached
// Chromium. Usage:  node tests/browser.mjs [baseUrl]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let chromium;
const importErrors = [];
for (const cand of [
  'playwright',
  'playwright-core',
  path.join(os.homedir(), '.npm-global/lib/node_modules/playwright-core/index.js'),
  '/opt/homebrew/lib/node_modules/playwright-mcp-tabbed/node_modules/playwright-core/index.js',
]) {
  try { const m = await import(cand); chromium = m.chromium || m.default?.chromium; if (chromium) break; }
  catch (e) { importErrors.push(cand + ': ' + e.message.split('\n')[0].slice(0, 70)); }
}
if (!chromium) {
  console.error('playwright-core not resolvable — skipping browser pass');
  importErrors.forEach(e => console.error('   ' + e));
  process.exit(2);
}

const base = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const shotDir = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

// resolve a cached Chromium if the default lookup misses
function findChromium() {
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter(d => /^chromium(_headless_shell)?-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const rel of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/headless_shell', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(root, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n + (x ? ' — ' + x : ''))) : (fail++, console.log('  ✗ ' + n + ' — ' + x)); };

const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {}).catch(async e => {
  console.log('   launch with explicit path failed (' + e.message.slice(0, 60) + '), retrying with default lookup');
  return chromium.launch();
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [], pageErrors = [], badRequests = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && !/semanticscholar|core\.ac\.uk/.test(r.url())) badRequests.push(r.status() + ' ' + r.url().slice(0, 70)); });

console.log('\nLive browser pass: ' + base);
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

ok('page loads with the expected title', (await page.title()).includes('CiteKit'), await page.title());
ok('header, search box, ask box and tabs all render',
   await page.locator('header h1').isVisible() && await page.locator('#q').isVisible() &&
   await page.locator('#ask').isVisible() && await page.locator('.tab[data-tab="library"]').isVisible());
ok('source checkboxes render (9 sources)', (await page.locator('.srcbar input[type=checkbox]').count()) === 9,
   (await page.locator('.srcbar input[type=checkbox]').count()) + ' checkboxes');
ok('no console errors on load', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
ok('no uncaught page errors on load', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

// ---- real search against live APIs, driven through the real UI ----
await page.fill('#q', 'structured literacy dyslexia reading intervention');
await page.click('#searchBtn');
let cards = 0;
try { await page.waitForSelector('#results .card', { timeout: 60000 }); cards = await page.locator('#results .card').count(); } catch {}
ok('search returns real rendered cards', cards > 0, cards + ' cards');
ok('results carry rank + source pills', (await page.locator('#results .pill').count()) > 0, (await page.locator('#results .pill').count()) + ' pills');
ok('search status line reports the counts', /\d+ unique papers/.test(await page.locator('#searchStatus').innerText()), (await page.locator('#searchStatus').innerText()).slice(0, 80));
ok('first card shows a real paper title', (await page.locator('#results .card h3').first().innerText()).length > 15,
   (await page.locator('#results .card h3').first().innerText()).slice(0, 60));

await page.screenshot({ path: shotDir + 'discover.png', fullPage: false });

// ---- add to library, switch tabs ----
await page.getByRole('button', { name: '+ Add' }).first().click();
await page.waitForTimeout(200);
ok('adding a result updates the library count', /\(1\)/.test(await page.locator('#libCount').innerText()), await page.locator('#libCount').innerText());
await page.click('.tab[data-tab="library"]');
await page.waitForTimeout(200);
ok('library tab lists the added paper', (await page.locator('#libList .libitem').count()) === 1, (await page.locator('#libList .libitem').count()) + ' items');
await page.screenshot({ path: shotDir + 'library.png' });

// ---- dry-run ask: full UI path, no API key needed ----
await page.click('.tab[data-tab="search"]');
await page.check('#dryRun');
await page.fill('#ask', 'What does the evidence say about structured literacy for dyslexic readers?');
await page.click('#askBtn');
await page.waitForTimeout(600);
const chatText = await page.locator('#chat').innerText();
ok('dry-run ask renders the prompt preview', /dry run/i.test(chatText) && /SOURCES:/.test(chatText), chatText.slice(0, 70).replace(/\n/g, ' '));
ok('dry-run renders the numbered source table', (await page.locator('#chat table.src').count()) > 0);
ok('no console errors after the full interaction', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
ok('no uncaught page errors after the full interaction', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
await page.screenshot({ path: shotDir + 'answer.png', fullPage: false });

// the control the user must reach has to be on screen, not merely in the DOM
for (const [w, h] of [[1440, 900], [900, 700]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(200);
  const geo = await page.evaluate(() => {
    const r = document.querySelector('#ask').getBoundingClientRect();
    const b = document.querySelector('#askBtn').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight, btnBottom: Math.round(b.bottom) };
  });
  ok(`ask box is fully on screen at ${w}x${h}`, geo.top > 0 && geo.bottom <= geo.h + 1,
     `ask top=${geo.top} bottom=${geo.bottom} viewport=${geo.h}`);
}

// ---- responsive: no horizontal overflow at two widths ----
for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    gridCols: getComputedStyle(document.querySelector('main')).gridTemplateColumns,
    askVisible: !!document.querySelector('#ask')?.offsetParent
  }));
  ok(`no horizontal overflow at ${w}px`, m.sw <= m.cw + 1, `scrollWidth=${m.sw} clientWidth=${m.cw}`);
  ok(`layout intact at ${w}px`, m.askVisible && m.gridCols.split(' ').length >= 2, m.gridCols);
}
await page.setViewportSize({ width: 900, height: 700 });
await page.screenshot({ path: shotDir + 'narrow.png' });

ok('no unexpected failing requests (excluding S2/CORE rate limits)', badRequests.length === 0, badRequests.slice(0, 2).join(' | '));
ok('screenshots written', fs.readdirSync(shotDir).length >= 4, fs.readdirSync(shotDir).join(', '));

await browser.close();
console.log(`\n=== browser pass: ${pass} passed, ${fail} failed ===`);
console.log('screenshots: ' + shotDir);
process.exit(fail ? 1 : 0);
