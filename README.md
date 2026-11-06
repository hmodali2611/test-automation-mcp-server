# Test Automation MCP Server

[![CI](https://github.com/hmodali2611/test-automation-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/hmodali2611/test-automation-mcp-server/actions/workflows/ci.yml)
[![M8ven Score](https://m8ven.ai/badge/mcp/hmodali2611-test-automation-mcp-server-1xlw3k?v=744b9d17f6cc7b2d745278503d8f9d86)](https://m8ven.ai/mcp/hmodali2611-test-automation-mcp-server-1xlw3k?s=readme)

## What it is

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants (Claude, GitHub Copilot, Cursor) safe, structured access to a test automation stack.

## Why it exists

An assistant in chat usually cannot run a suite, read why tests failed, pull test data, or file a bug with evidence. This server gives it those actions through a small set of defined tools, with safety built in, so an investigation is repeatable and shareable instead of being a one-off chat answer.

## Scope and limits

In scope:

- Tools: `list_test_suites`, `run_tests`, `get_test_results`, `get_failure_details`, `query_test_data`, `write_investigation_report`, `create_jira_bug` (draft file when no Jira credentials are set).
- Prompt `triage_failures`: run, inspect, re-run to rule out flakiness, classify, report, and file bugs only for real defects.
- Works with any framework that writes JUnit XML.

Out of scope, per the original README:

- A built-in Playwright or Appium driver.
- Interactive debugging, breakpoints, or live device control.

Other limits from the original README:

- This server runs suites you configure in the config file and reads the JUnit XML those suites produce. The examples show a Playwright web suite and an Appium plus TestNG iOS suite because both produce JUnit XML.
- Debugging here means inspecting failure details: error message, stack trace, and captured output for a failing test.
- `create_jira_bug` files a live Jira issue only when Jira credentials are set. Without them, it writes a draft file to `reports/jira-drafts/` and reports that no issue was created.
- An investigation is repeatable through the `triage_failures` prompt, and it is logged and shareable through `write_investigation_report`, which writes a markdown report to `reports/investigations/`, plus the JUnit report and the Jira issue or draft.

## Features and how it works

From a chat, an assistant can run a suite, read why tests failed, pull test data, write a shareable investigation report, and file a Jira bug with the evidence.

```text
"Run the checkout suite and file bugs for anything that's a real defect."

 assistant -> run_tests(sample-e2e)          6 tests: 3 passed, 2 failed, 1 skipped
           -> get_failure_details(promo)     Expected "$39.20" Received "$49.00" · API: PROMO_EXPIRED
           -> run_tests(filter: "order")     still times out -> flaky / environment, no bug
           -> query_test_data(promoCodes)    SPRING10 is marked expired in test data -> test data issue
           -> create_jira_bug(...)           only for confirmed product defects
```

| Tool | What it does |
| --- | --- |
| `list_test_suites` | Lists configured suites, their commands and report paths |
| `run_tests` | Runs a suite (optionally filtered to matching tests) and returns pass/fail counts plus each failure |
| `get_test_results` | Summarizes the latest JUnit report without re-running |
| `get_failure_details` | Error message, stack trace and captured output for a failing test |
| `query_test_data` | Looks up accounts, products, promo codes, etc. from a JSON fixture file |
| `write_investigation_report` | Writes a shareable markdown report for one triaged test, with its classification, evidence, and action |
| `create_jira_bug` | Files a Jira Cloud bug; writes a draft file instead when no credentials are set |

Prompt: `triage_failures` walks the assistant through run, inspect, re-run to rule out flakiness, classify (product defect, test issue, environment), write an investigation report for each failure, and file bugs only for real defects.

Works with any framework that writes JUnit XML: Playwright, TestNG, Maven Surefire, JUnit 5, pytest and most CI tools all produce JUnit XML, so one parser covers web and mobile suites. See `examples/mcp-tests.playwright-and-testng.json` for a Playwright web suite next to an Appium + TestNG iOS suite.

Design choices, from the original README:

- The model never gets a raw shell. It can only run suites defined in the config file. Test filters are shell-quoted, so a test name cannot inject commands.
- Small, model-friendly outputs. Tools return counts and one line per failure; details come only when asked. That keeps context windows small on large suites.
- Errors are tool results, not crashes. A bad suite name or a missing report comes back as `isError: true` with a clear message the assistant can act on.
- Safe by default. Jira writes are drafts until credentials are provided, and read-only tools are annotated `readOnlyHint`.

## Prerequisites

An environment that can run `npm install`, `npm test` and `npm run build`, as in Quick start below. No other prerequisite is stated in the original README.

## Quick start

```bash
npm install
npm test          # 14 tests: JUnit parsing + every tool end to end over an in-memory MCP transport, plus Jira https guard
npm run build
```

Connect it to Claude Desktop or Claude Code (`claude_desktop_config.json` / `.mcp.json`):

```json
{
  "mcpServers": {
    "test-automation": {
      "command": "node",
      "args": ["/absolute/path/to/test-automation-mcp-server/dist/index.js", "/absolute/path/to/mcp-tests.config.json"],
      "env": {
        "JIRA_BASE_URL": "https://your-company.atlassian.net",
        "JIRA_EMAIL": "you@company.com",
        "JIRA_API_TOKEN": "..."
      }
    }
  }
}
```

Leave the Jira variables out to keep `create_jira_bug` in draft mode (drafts go to `reports/jira-drafts/`).

## Usage

Configure suites in a config file, for example:

```json
{
  "suites": [
    {
      "name": "web-e2e",
      "command": "npx playwright test --reporter=junit",
      "cwd": "../my-web-app",
      "junitReport": "test-results/junit.xml",
      "grepFlag": "--grep"
    }
  ],
  "testDataFile": "data/test-data.json",
  "jira": { "projectKey": "QA", "issueType": "Bug" }
}
```

Then use the tools listed above, or the `triage_failures` prompt, to run, inspect, classify, report and, for confirmed product defects only, file a Jira bug.

## Testing

```bash
npm test          # 14 tests: JUnit parsing + every tool end to end over an in-memory MCP transport, plus Jira https guard
```

Verified in CI with a real Android emulator (2026-11-01, GitHub Actions run 41373946277, 1m 57s): a real emulator booted, ApiDemos installed, and `run_tests` ran 2 tests in 7.3s with 1 passed and 1 failed. The failure was a real UiAutomator2 NoSuchElement error for `testMissingElement`, and an investigation report was saved. The passing test is identified only by elimination (2 tests total, only `testMissingElement` failed), not by a named pass line. Jira filing remains draft only without credentials, and Claude or Copilot use has not been tested in a live client session.

## Project layout

The original README does not include a project layout table, so none is claimed here. The files named in the original README include the config examples, the JUnit report outputs, `reports/investigations/` for investigation reports, and `reports/jira-drafts/` for Jira drafts.

## Tech

TypeScript · MCP TypeScript SDK · Zod · Vitest · JUnit XML · Jira Cloud REST API

## Run with a real model in CI

The original README does not describe a real-model CI workflow for this repo, so none is claimed here.

## License

MIT, Copyright (c) 2026 Harika Modali.
