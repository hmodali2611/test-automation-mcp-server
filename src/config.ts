import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const SuiteSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  /** Shell command that runs the suite, e.g. "npx playwright test" or "mvn -q test". */
  command: z.string(),
  /** Working directory, relative to the config file. */
  cwd: z.string().default('.'),
  /** JUnit XML report the command produces (Playwright, TestNG, Maven Surefire, pytest all can). */
  junitReport: z.string(),
  /** Optional flag used to pass a test filter, e.g. "--grep" for Playwright or "-Dtest=" for Maven. */
  grepFlag: z.string().optional(),
  timeoutSeconds: z.number().default(600),
});

const ConfigSchema = z.object({
  suites: z.array(SuiteSchema).min(1),
  testDataFile: z.string().optional(),
  jira: z
    .object({
      projectKey: z.string(),
      issueType: z.string().default('Bug'),
    })
    .optional(),
  reportsDir: z.string().default('reports'),
});

export type Suite = z.infer<typeof SuiteSchema>;
export type Config = z.infer<typeof ConfigSchema> & { baseDir: string };

export function loadConfig(path = process.env.MCP_TESTS_CONFIG ?? 'mcp-tests.config.json'): Config {
  const abs = resolve(path);
  const parsed = ConfigSchema.parse(JSON.parse(readFileSync(abs, 'utf8')));
  return { ...parsed, baseDir: dirname(abs) };
}

export function findSuite(config: Config, name: string): Suite {
  const suite = config.suites.find((s) => s.name === name);
  if (!suite) {
    throw new Error(`Unknown suite "${name}". Available: ${config.suites.map((s) => s.name).join(', ')}`);
  }
  return suite;
}

export const resolveFrom = (config: Config, ...parts: string[]) => resolve(config.baseDir, ...parts);
