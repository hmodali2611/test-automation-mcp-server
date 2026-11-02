import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';

const text = (r: any) => r.content.map((c: any) => c.text).join('\n');

describe('MCP server (end to end over an in-memory transport)', () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  beforeAll(async () => {
    delete process.env.JIRA_BASE_URL;
    rmSync('reports', { recursive: true, force: true });
    const server = createServer(loadConfig('mcp-tests.config.json'));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  });
  afterAll(() => client.close());

  it('exposes the expected tools and prompt', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_jira_bug',
      'get_failure_details',
      'get_test_results',
      'list_test_suites',
      'query_test_data',
      'run_tests',
      'write_investigation_report',
    ]);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['triage_failures']);
  });

  it('runs a suite and reports failures', async () => {
    const res = await client.callTool({ name: 'run_tests', arguments: { suite: 'sample-e2e' } });
    const out = text(res);
    expect(out).toContain('6 tests: 3 passed, 2 failed, 1 skipped');
    expect(out).toContain('FAIL shoplite-e2e › checkout applies promo code');
  });

  it('re-runs a single test with a filter', async () => {
    const res = await client.callTool({ name: 'run_tests', arguments: { suite: 'sample-e2e', filter: 'promo' } });
    expect(text(res)).toContain('1 tests: 0 passed, 1 failed');
  });

  it('returns failure details including captured network output', async () => {
    const res = await client.callTool({
      name: 'get_failure_details',
      arguments: { suite: 'sample-e2e', testName: 'promo' },
    });
    expect(text(res)).toContain('PROMO_EXPIRED');
  });

  it('looks up test data with a filter', async () => {
    const res = await client.callTool({
      name: 'query_test_data',
      arguments: { entity: 'promoCodes', filter: { status: 'active' } },
    });
    expect(JSON.parse(text(res))).toMatchObject({ total: 1, rows: [{ code: 'SAVE20' }] });
  });

  it('writes a Jira draft when no credentials are configured', async () => {
    const res = await client.callTool({
      name: 'create_jira_bug',
      arguments: {
        summary: 'Promo code SPRING10 is not applied at checkout',
        description: 'Steps: add earbuds, apply SPRING10.\nExpected: 10% off.\nActual: full price; API says PROMO_EXPIRED.',
        priority: 'High',
      },
    });
    const out = text(res);
    expect(out).toContain('Draft saved to');
    const path = out.split('Draft saved to ')[1].trim();
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).fields.project.key).toBe('QA');
  });

  it('writes a shareable investigation report for a classified failure', async () => {
    const res = await client.callTool({
      name: 'write_investigation_report',
      arguments: {
        suite: 'sample-e2e',
        testName: 'checkout applies promo code',
        classification: 'TEST_ISSUE',
        evidence: 'API says PROMO_EXPIRED; SPRING10 is marked expired in test data.',
        action: 'Fix the test data, do not file a product bug.',
      },
    });
    const out = text(res);
    expect(out).toContain('Investigation report saved to');
    const path = out.split('Investigation report saved to ')[1].trim();
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Classification: TEST_ISSUE');
    expect(content).toContain('PROMO_EXPIRED');
    expect(content).toContain('Fix the test data');
  });

  it('returns a tool error (not a crash) for an unknown suite', async () => {
    const res: any = await client.callTool({ name: 'run_tests', arguments: { suite: 'nope' } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('Unknown suite "nope"');
  });
});
