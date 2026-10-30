import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BugInput {
  summary: string;
  description: string;
  priority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  labels?: string[];
}

export interface BugResult {
  mode: 'created' | 'draft';
  key?: string;
  url?: string;
  draftPath?: string;
  payload: unknown;
}

/** Jira Cloud wants descriptions in Atlassian Document Format; one paragraph per line is enough. */
function toAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

/**
 * Create a Jira bug when JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are set.
 * Otherwise write a draft JSON file, so the tool is safe to try without touching a real tracker.
 */
export async function fileBug(
  input: BugInput,
  opts: { projectKey: string; issueType: string; reportsDir: string },
): Promise<BugResult> {
  const payload = {
    fields: {
      project: { key: opts.projectKey },
      issuetype: { name: opts.issueType },
      summary: input.summary.slice(0, 250),
      description: toAdf(input.description),
      priority: input.priority ? { name: input.priority } : undefined,
      labels: ['automation', ...(input.labels ?? [])],
    },
  };

  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    const dir = join(opts.reportsDir, 'jira-drafts');
    mkdirSync(dir, { recursive: true });
    const draftPath = join(dir, `bug-${Date.now()}.json`);
    writeFileSync(draftPath, JSON.stringify(payload, null, 2));
    return { mode: 'draft', draftPath, payload };
  }

  const res = await fetch(`${JIRA_BASE_URL.replace(/\/$/, '')}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Jira returned ${res.status}: ${await res.text()}`);
  const { key } = (await res.json()) as { key: string };
  return { mode: 'created', key, url: `${JIRA_BASE_URL.replace(/\/$/, '')}/browse/${key}`, payload };
}
