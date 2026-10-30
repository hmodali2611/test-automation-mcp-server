import { readFileSync, existsSync, statSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

export type Status = 'passed' | 'failed' | 'error' | 'skipped';

export interface TestCaseResult {
  suite: string;
  name: string;
  classname?: string;
  status: Status;
  durationSeconds: number;
  message?: string;
  details?: string;
  stdout?: string;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationSeconds: number;
  reportUpdatedAt?: string;
  cases: TestCaseResult[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  isArray: (name) => ['testsuite', 'testcase', 'failure', 'error'].includes(name),
});

const text = (node: unknown): string | undefined => {
  if (node == null) return undefined;
  if (typeof node === 'string') return node.trim();
  const t = (node as Record<string, unknown>)['#text'];
  return typeof t === 'string' ? t.trim() : undefined;
};

/** Parse JUnit XML as written by Playwright, TestNG, Maven Surefire, pytest and most CI tools. */
export function parseJUnit(xml: string): RunSummary {
  const doc = parser.parse(xml);
  const suites: any[] = doc.testsuites?.testsuite ?? doc.testsuite ?? [];
  const cases: TestCaseResult[] = [];

  for (const suite of suites) {
    for (const tc of suite.testcase ?? []) {
      const failure = tc.failure?.[0];
      const error = tc.error?.[0];
      const problem = failure ?? error;
      const status: Status = failure ? 'failed' : error ? 'error' : tc.skipped !== undefined ? 'skipped' : 'passed';
      cases.push({
        suite: suite.name ?? 'suite',
        name: tc.name,
        classname: tc.classname,
        status,
        durationSeconds: Number(tc.time ?? 0),
        message: problem ? (problem.message ?? text(problem)?.split('\n')[0]) : undefined,
        details: problem ? text(problem) : undefined,
        stdout: text(tc['system-out']),
      });
    }
  }

  const count = (s: Status) => cases.filter((c) => c.status === s).length;
  return {
    total: cases.length,
    passed: count('passed'),
    failed: count('failed') + count('error'),
    skipped: count('skipped'),
    durationSeconds: Number(cases.reduce((t, c) => t + c.durationSeconds, 0).toFixed(3)),
    cases,
  };
}

export function readJUnitFile(path: string): RunSummary {
  if (!existsSync(path)) throw new Error(`No JUnit report at ${path}. Run the suite first.`);
  return { ...parseJUnit(readFileSync(path, 'utf8')), reportUpdatedAt: statSync(path).mtime.toISOString() };
}

/** Short, model-friendly summary: counts plus one line per failure. */
export function summarize(run: RunSummary, maxFailures = 20): string {
  const lines = [
    `${run.total} tests: ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped (${run.durationSeconds}s)`,
  ];
  const failures = run.cases.filter((c) => c.status === 'failed' || c.status === 'error');
  for (const f of failures.slice(0, maxFailures)) {
    lines.push(`FAIL ${f.suite} › ${f.name}: ${f.message ?? 'no message'}`);
  }
  if (failures.length > maxFailures) lines.push(`…and ${failures.length - maxFailures} more failures`);
  return lines.join('\n');
}
