// A stand-in test suite so the server can be tried without a real project.
// Writes a JUnit report with 3 passes, 1 product failure, 1 flaky timeout and 1 skip.
// A --grep '<text>' argument limits the report to matching tests (like Playwright's --grep).
import { mkdirSync, writeFileSync } from 'node:fs';

const grepIndex = process.argv.indexOf('--grep');
const grep = grepIndex > -1 ? process.argv[grepIndex + 1].toLowerCase() : '';

const cases = [
  { name: 'login with valid credentials', time: 1.2 },
  { name: 'add item to cart', time: 0.8 },
  { name: 'search returns results', time: 0.6 },
  {
    name: 'checkout applies promo code',
    time: 2.1,
    failure: {
      message: 'expect(received).toHaveText(expected): Expected "$39.20" Received "$49.00"',
      body: 'Error: expect(received).toHaveText(expected)\n  Expected: "$39.20"\n  Received: "$49.00"\n    at checkout.spec.ts:42:31',
    },
    out: 'POST /api/cart/promo -> 200 {"applied":false,"reason":"PROMO_EXPIRED"}',
  },
  {
    name: 'order history loads',
    time: 30.0,
    failure: {
      message: 'TimeoutError: locator.waitFor: Timeout 30000ms exceeded',
      body: 'TimeoutError: waiting for getByTestId("order-row") to be visible\n    at history.spec.ts:18:12',
    },
  },
  { name: 'wishlist sync (pending feature)', time: 0, skipped: true },
].filter((c) => !grep || c.name.toLowerCase().includes(grep));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="shoplite-e2e" tests="${cases.length}">
  <testsuite name="shoplite-e2e" tests="${cases.length}">
${cases
  .map((c) => {
    const inner = c.failure
      ? `<failure message="${esc(c.failure.message)}">${esc(c.failure.body)}</failure>`
      : c.skipped
        ? '<skipped/>'
        : '';
    const out = c.out ? `<system-out>${esc(c.out)}</system-out>` : '';
    return `    <testcase name="${esc(c.name)}" classname="e2e" time="${c.time}">${inner}${out}</testcase>`;
  })
  .join('\n')}
  </testsuite>
</testsuites>
`;

mkdirSync('results', { recursive: true });
writeFileSync('results/junit.xml', xml);
const failed = cases.filter((c) => c.failure).length;
console.log(`${cases.length} tests, ${failed} failed`);
process.exit(failed ? 1 : 0);
