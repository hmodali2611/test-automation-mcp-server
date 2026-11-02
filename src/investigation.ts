import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type InvestigationClassification = 'PRODUCT_DEFECT' | 'TEST_ISSUE' | 'ENVIRONMENT';

export interface InvestigationInput {
  suite: string;
  testName: string;
  classification: InvestigationClassification;
  evidence: string;
  action: string;
}

/**
 * Write a shareable markdown investigation report for one triaged test.
 * This is the logged artifact behind the "repeatable, logged, and shareable"
 * claim: the same run, failure details, classification, and action, in a file
 * that can be attached to a bug or shared with a reviewer.
 */
export function writeInvestigationReport(
  input: InvestigationInput,
  opts: { reportsDir: string },
): { reportPath: string; content: string } {
  const safeTest = input.testName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'test';
  const dir = join(opts.reportsDir, 'investigations');
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, `${input.suite}-${safeTest}-${Date.now()}.md`);
  const content = [
    `# Investigation report: ${input.testName}`,
    '',
    `- Suite: ${input.suite}`,
    `- Classification: ${input.classification}`,
    '',
    '## Evidence',
    '',
    input.evidence,
    '',
    '## Action',
    '',
    input.action,
    '',
  ].join('\n');
  writeFileSync(reportPath, content);
  return { reportPath, content };
}
