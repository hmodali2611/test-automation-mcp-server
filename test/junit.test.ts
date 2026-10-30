import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJUnit, summarize } from '../src/junit.js';

describe('parseJUnit', () => {
  it('reads a TestNG/Surefire style single <testsuite> report', () => {
    const run = parseJUnit(readFileSync('test/fixtures/testng-results.xml', 'utf8'));
    expect(run).toMatchObject({ total: 3, passed: 1, failed: 2, skipped: 0 });
    const cart = run.cases.find((c) => c.name === 'testAddToCart')!;
    expect(cart.status).toBe('failed');
    expect(cart.message).toBe('expected [2] but found [1]');
    expect(cart.details).toContain('CartTest.java:57');
    expect(run.cases.find((c) => c.name === 'testCheckout')!.status).toBe('error');
  });

  it('reads a <testsuites> wrapper with skipped tests', () => {
    const run = parseJUnit(`<testsuites><testsuite name="s">
      <testcase name="a" time="1"/><testcase name="b" time="0"><skipped/></testcase>
    </testsuite></testsuites>`);
    expect(run).toMatchObject({ total: 2, passed: 1, skipped: 1, failed: 0, durationSeconds: 1 });
  });

  it('summarizes failures one per line', () => {
    const run = parseJUnit(readFileSync('test/fixtures/testng-results.xml', 'utf8'));
    expect(summarize(run)).toBe(
      [
        '3 tests: 1 passed, 2 failed, 0 skipped (12.5s)',
        'FAIL MobileRegression › testAddToCart: expected [2] but found [1]',
        'FAIL MobileRegression › testCheckout: NoSuchElementException: id=checkout_button',
      ].join('\n'),
    );
  });
});
