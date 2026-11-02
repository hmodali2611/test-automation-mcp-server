import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type Config, findSuite, resolveFrom } from './config.js';
import { readJUnitFile, summarize } from './junit.js';
import { runCommand, shellQuote } from './runner.js';
import { fileBug } from './jira.js';
import { writeInvestigationReport } from './investigation.js';
import { listEntities, queryTestData } from './testData.js';

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

/** Wrap a handler so thrown errors come back to the model as tool errors instead of crashing the server. */
function safe<A>(fn: (args: A) => Promise<ReturnType<typeof ok>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail((e as Error).message);
    }
  };
}

export function createServer(config: Config): McpServer {
  const server = new McpServer({ name: 'test-automation-mcp-server', version: '1.0.0' });

  server.registerTool(
    'list_test_suites',
    {
      title: 'List test suites',
      description: 'List the test suites this server can run, with their commands and report locations.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () =>
      ok(
        config.suites
          .map((s) => `- ${s.name}: ${s.description ?? ''}\n  command: ${s.command}\n  report: ${s.junitReport}`)
          .join('\n'),
      ),
    ),
  );

  server.registerTool(
    'run_tests',
    {
      title: 'Run a test suite',
      description:
        'Run a configured test suite (optionally filtered) and return pass/fail counts and the failing tests. ' +
        'Use get_failure_details next to dig into a specific failure.',
      inputSchema: {
        suite: z.string().describe('Suite name from list_test_suites'),
        filter: z.string().optional().describe('Optional test name filter, passed with the suite grep flag'),
      },
    },
    safe(async ({ suite, filter }: { suite: string; filter?: string }) => {
      const s = findSuite(config, suite);
      if (filter && !s.grepFlag) throw new Error(`Suite "${suite}" has no grepFlag configured, so it cannot be filtered`);
      const command = filter ? `${s.command} ${s.grepFlag}${s.grepFlag!.endsWith('=') ? '' : ' '}${shellQuote(filter)}` : s.command;
      const result = await runCommand(command, resolveFrom(config, s.cwd), s.timeoutSeconds);
      if (result.timedOut) return fail(`Suite "${suite}" timed out after ${s.timeoutSeconds}s.\n${result.outputTail}`);

      let report: string;
      try {
        report = summarize(readJUnitFile(resolveFrom(config, s.cwd, s.junitReport)));
      } catch {
        return fail(`Suite exited with code ${result.exitCode} and wrote no JUnit report.\nOutput:\n${result.outputTail}`);
      }
      return ok(`Ran "${suite}" in ${(result.durationMs / 1000).toFixed(1)}s (exit code ${result.exitCode}).\n${report}`);
    }),
  );

  server.registerTool(
    'get_test_results',
    {
      title: 'Get latest results',
      description: 'Summarize the most recent JUnit report for a suite without re-running it.',
      inputSchema: { suite: z.string() },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ suite }: { suite: string }) => {
      const s = findSuite(config, suite);
      const run = readJUnitFile(resolveFrom(config, s.cwd, s.junitReport));
      return ok(`Report updated ${run.reportUpdatedAt}\n${summarize(run)}`);
    }),
  );

  server.registerTool(
    'get_failure_details',
    {
      title: 'Get failure details',
      description: 'Return the error message, stack trace and captured output for failing tests whose name contains the given text.',
      inputSchema: { suite: z.string(), testName: z.string().describe('Full or partial test name') },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ suite, testName }: { suite: string; testName: string }) => {
      const s = findSuite(config, suite);
      const run = readJUnitFile(resolveFrom(config, s.cwd, s.junitReport));
      const matches = run.cases.filter(
        (c) => (c.status === 'failed' || c.status === 'error') && c.name.toLowerCase().includes(testName.toLowerCase()),
      );
      if (!matches.length) return fail(`No failing test matching "${testName}" in the latest "${suite}" report.`);
      return ok(
        matches
          .map((c) =>
            [
              `### ${c.suite} › ${c.name}`,
              `status: ${c.status}, duration: ${c.durationSeconds}s`,
              `message: ${c.message ?? '-'}`,
              `details:\n${(c.details ?? '').slice(0, 3000)}`,
              c.stdout ? `stdout:\n${c.stdout.slice(0, 1500)}` : '',
            ].join('\n'),
          )
          .join('\n\n'),
      );
    }),
  );

  server.registerTool(
    'query_test_data',
    {
      title: 'Query test data',
      description: 'Look up test accounts, products or other fixtures, filtered by exact field values.',
      inputSchema: {
        entity: z.string().describe('e.g. users, products'),
        filter: z.record(z.string()).optional().describe('Field/value pairs, e.g. {"role": "admin"}'),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ entity, filter, limit }: { entity: string; filter?: Record<string, string>; limit?: number }) => {
      if (!config.testDataFile) throw new Error('No testDataFile configured');
      const file = resolveFrom(config, config.testDataFile);
      if (entity === '?') return ok(`Entities: ${listEntities(file).join(', ')}`);
      return ok(JSON.stringify(queryTestData(file, entity, filter, limit), null, 2));
    }),
  );

  server.registerTool(
    'write_investigation_report',
    {
      title: 'Write an investigation report',
      description:
        'Write a shareable markdown investigation report for one triaged test, with its classification, evidence, and action. ' +
        'Use this after classifying a failure, so the investigation is logged to a file instead of living only in chat.',
      inputSchema: {
        suite: z.string().describe('Suite name from list_test_suites'),
        testName: z.string().describe('Full or partial test name'),
        classification: z.enum(['PRODUCT_DEFECT', 'TEST_ISSUE', 'ENVIRONMENT']),
        evidence: z.string().min(1).describe('Failure details, logs, or test data that support the classification'),
        action: z.string().min(1).describe('What happens next: file a bug, fix the test, or fix the environment'),
      },
    },
    safe(async (input: { suite: string; testName: string; classification: 'PRODUCT_DEFECT' | 'TEST_ISSUE' | 'ENVIRONMENT'; evidence: string; action: string }) => {
      findSuite(config, input.suite);
      const result = writeInvestigationReport(input, {
        reportsDir: resolveFrom(config, config.reportsDir),
      });
      return ok(`Investigation report saved to ${result.reportPath}`);
    }),
  );

  server.registerTool(
    'create_jira_bug',
    {
      title: 'File a Jira bug',
      description:
        'File a bug for a confirmed product defect. Include reproduction steps, expected vs actual result and the failing test name. ' +
        'Without Jira credentials this writes a draft file instead of creating a real issue.',
      inputSchema: {
        summary: z.string().min(10),
        description: z.string().min(20),
        priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    safe(async (input: { summary: string; description: string; priority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest'; labels?: string[] }) => {
      if (!config.jira) throw new Error('No jira section in config');
      const result = await fileBug(input, {
        projectKey: config.jira.projectKey,
        issueType: config.jira.issueType,
        reportsDir: resolveFrom(config, config.reportsDir),
      });
      return ok(
        result.mode === 'created'
          ? `Created ${result.key}: ${result.url}`
          : `Jira credentials not set, so no issue was created. Draft saved to ${result.draftPath}`,
      );
    }),
  );

  server.registerPrompt(
    'triage_failures',
    {
      title: 'Triage failing tests',
      description: 'Run a suite, classify each failure and draft bugs only for real product defects.',
      argsSchema: { suite: z.string() },
    },
    ({ suite }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Run the "${suite}" suite with run_tests. For each failure, call get_failure_details and classify it as ` +
              `PRODUCT_DEFECT, TEST_ISSUE (bad locator, bad data, timing) or ENVIRONMENT. ` +
              `Re-run once with a filter to rule out flakiness. Call write_investigation_report for each failure, ` +
              `with its classification, evidence, and action, so the investigation is logged to a file. ` +
              `Only call create_jira_bug for PRODUCT_DEFECT, with ` +
              `steps to reproduce, expected and actual results. Finish with a table: test, classification, evidence, action.`,
          },
        },
      ],
    }),
  );

  return server;
}
