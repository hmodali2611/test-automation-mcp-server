// Real Appium test against the public ApiDemos app on a real Android
// emulator. This script is meant to run in GitHub Actions, where an
// emulator is available. It is NOT a mock: it creates a real WebDriver
// session on a real Appium server, finds real elements in ApiDemos, and
// writes a real JUnit report from the actual results.
// Tests:
//  - testOpenViews: open ApiDemos, find accessibility id "Views", tap it.
//    Expected to pass on a booted emulator.
//  - testMissingElement: find an accessibility id that does not exist.
//    Expected to fail with a real NoSuchElement response from UiAutomator2.
//    This is a negative test, not a product defect, and the triage step
//    should classify it as a test issue.
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.APPIUM_SERVER || 'http://127.0.0.1:4723';
const grepIndex = process.argv.indexOf('--grep');
const filter = grepIndex > -1 ? process.argv[grepIndex + 1].toLowerCase() : '';

async function wd(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.value?.message || `WebDriver ${res.status}`);
    err.details = json.value?.stacktrace || JSON.stringify(json.value || {});
    throw err;
  }
  return json.value;
}

async function session() {
  const v = await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Android Emulator',
        'appium:appPackage': 'io.appium.android.apis',
        'appium:appActivity': '.ApiDemos',
        'appium:noReset': true,
      },
    },
  });
  return v.sessionId;
}
async function find(sid, strategy, value) {
  const v = await wd('POST', `/session/${sid}/element`, { using: strategy, value });
  return v['element-6066-11e4-a52e-4f735466cecf'] || v.ELEMENT;
}
async function click(sid, eid) {
  await wd('POST', `/session/${sid}/element/${eid}/click`, {});
}

const tests = [
  {
    name: 'testOpenViews',
    run: async () => {
      const sid = await session();
      try { await click(sid, await find(sid, 'accessibility id', 'Views')); }
      finally { await wd('DELETE', `/session/${sid}`).catch(() => {}); }
    },
  },
  {
    name: 'testMissingElement',
    run: async () => {
      const sid = await session();
      try { await find(sid, 'accessibility id', 'ThisElementDoesNotExist12345'); }
      finally { await wd('DELETE', `/session/${sid}`).catch(() => {}); }
    },
  },
];

const results = [];
for (const t of tests.filter((t) => !filter || t.name.toLowerCase().includes(filter))) {
  const start = Date.now();
  try {
    await t.run();
    results.push({ ...t, status: 'passed', time: ((Date.now() - start) / 1000).toFixed(1) });
  } catch (e) {
    results.push({ ...t, status: 'failed', time: ((Date.now() - start) / 1000).toFixed(1), message: e.message, details: e.details || String(e) });
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const failed = results.filter((r) => r.status === 'failed').length;
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="ApiDemos" tests="${results.length}" failures="${failed}" errors="0" skipped="0">\n${results
  .map((r) => {
    const inner = r.status === 'failed' ? `<failure message="${esc(r.message)}">${esc(r.details)}</failure>` : '';
    return `  <testcase classname="ApiDemos" name="${r.name}" time="${r.time}">${inner}</testcase>`;
  })
  .join('\n')}\n</testsuite>\n`;
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/junit.xml', xml);
console.log(`${results.length} tests, ${failed} failed (real Appium, ApiDemos)`);
process.exit(failed ? 1 : 0);
