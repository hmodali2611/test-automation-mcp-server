import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileBug } from '../src/jira.js';

const input = {
  summary: 'Promo code SPRING10 is not applied at checkout',
  description: 'Steps: add earbuds, apply SPRING10.\nExpected: 10% off.\nActual: full price.',
};

describe('fileBug Jira URL guard', () => {
  let reportsDir: string;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    reportsDir = mkdtempSync(join(tmpdir(), 'mcp-jira-test-'));
  });
  afterEach(() => {
    rmSync(reportsDir, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  it('writes a draft when no Jira credentials are set', async () => {
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
    const result = await fileBug(input, { projectKey: 'QA', issueType: 'Bug', reportsDir });
    expect(result.mode).toBe('draft');
    expect(result.draftPath).toContain('jira-drafts');
  });

  it('rejects a non-https JIRA_BASE_URL when credentials are set', async () => {
    process.env.JIRA_BASE_URL = 'http://jira.example.com';
    process.env.JIRA_EMAIL = 'qa@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';
    await expect(fileBug(input, { projectKey: 'QA', issueType: 'Bug', reportsDir })).rejects.toThrow(
      'JIRA_BASE_URL must start with https://',
    );
  });

  it('rejects a non-https JIRA_BASE_URL even when it has no scheme', async () => {
    process.env.JIRA_BASE_URL = 'jira.example.com';
    process.env.JIRA_EMAIL = 'qa@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';
    await expect(fileBug(input, { projectKey: 'QA', issueType: 'Bug', reportsDir })).rejects.toThrow(
      'JIRA_BASE_URL must start with https://',
    );
  });
});
