---
name: test-automation-triage
description: Triage failing Playwright and Appium test suites over MCP — run a suite, read the JUnit report, re-run once to rule out flakiness, classify each failure, write an investigation report, and file a Jira bug only for confirmed product defects.
---

# Test Automation Triage

Use this skill when the user asks you to find out why tests are failing, triage a red suite,
investigate a flaky test, or file bugs for test failures. It drives the
`test-automation-mcp-server` MCP server (7 tools, plus the `triage_failures` prompt).

## When to use this skill

Trigger phrases and situations:

- "Run the suite and tell me what failed"
- "Triage the failing tests" / "Why is CI red?"
- "Is this failure flaky or a real defect?"
- "File a bug for the failing test"
- "Investigate the checkout failure and write it up"

Do not use it for writing new tests, editing test code, or debugging a test
interactively — this skill has no built-in Playwright or Appium driver and no
interactive debugging (see Limitations).

## Tools you have

| Tool | Effect | Annotation |
| --- | --- | --- |
| `list_test_suites` | Lists configured suites, their commands and report paths | read-only |
| `run_tests` | Runs a suite (optionally filtered) and returns pass/fail counts and the failures | destructive — it executes tests |
| `get_test_results` | Summarizes the latest JUnit report without re-running | read-only |
| `get_failure_details` | Error message, stack trace and captured output for a failing test | read-only |
| `query_test_data` | Looks up test accounts, products, promo codes from a JSON fixture file | read-only |
| `write_investigation_report` | Writes a shareable markdown report for one triaged test | destructive — it writes a file |
| `create_jira_bug` | Files a Jira Cloud bug, or writes a draft file when no Jira credentials are set | destructive — it creates an issue or a draft file |

There are 7 tools. The three state-changing tools are annotated
`destructiveHint: true`; the four read-only tools are annotated
`readOnlyHint: true`. Treat the destructive ones as actions that need the
user's intent, not as free reads.

## Triage workflow

Follow these steps in order. Do not skip the re-run, and do not file a bug
before classifying.

1. **List, then run.** Call `list_test_suites` to confirm the suite name, then
   `run_tests` for that suite. Never run a suite that is not in the config —
   if the user names one that is not listed, say so and stop.
2. **Read the failures.** For each failing test, call `get_failure_details`
   with the test name. Use `get_test_results` if you only need the latest
   report without re-running. Use `query_test_data` when the failure points at
   test data (expired promo code, wrong fixture, missing account).
3. **Re-run once to rule out flakiness.** Call `run_tests` again with a
   `filter` for the failing test. If it passes on the re-run, it is flaky or
   environment-dependent — do not file a bug. If it fails the same way twice,
   it is a repeatable failure; continue.
4. **Classify each failure** as exactly one of:
   - `PRODUCT_DEFECT` — the product behaves wrong (wrong price, missing
     element that should exist, wrong API response for valid input).
   - `TEST_ISSUE` — the test or its data is wrong (bad locator, expired test
     data, wrong expected value).
   - `ENVIRONMENT` — the environment is at fault (timeout, device or emulator
     not ready, network blip, service down).
5. **Write an investigation report.** Call `write_investigation_report` for
   every failure, with the suite, test name, classification, the evidence
   (failure message, logs, or test data that supports the classification), and
   the action (file a bug, fix the test, or fix the environment). The report is
   saved to `reports/investigations/` so the investigation lives in a file,
   not only in chat.
6. **File a Jira bug only for confirmed defects.** Call `create_jira_bug` only
   for failures classified `PRODUCT_DEFECT` after the re-run confirmed them.
   Include reproduction steps, expected vs actual result, and the failing test
   name. Without Jira credentials it writes a draft to
   `reports/jira-drafts/` and reports that no issue was created — that is
   normal, not an error.
7. **Finish with a table:** test, classification, evidence, action.

The server also ships a `triage_failures` prompt that walks through this same
sequence; prefer it when the client supports prompts, and follow this workflow
when it does not.

## What NOT to do

- Do not file a Jira bug for a flaky failure, an environment failure, or a
  test issue. A bug filed for the wrong cause wastes a developer's time and
  hides the real problem.
- Do not run a suite that is not in the config file, and do not invent a
  command to run. The model never gets a raw shell: only suites defined in
  the operator-owned config can run, and the only model-supplied part is the
  test-name filter, which is shell-quoted.
- Do not paste secrets. Never put a Jira API token, password, or any
  credential into chat, a report, a Jira issue, or a draft file. Credentials
  live only in environment variables on the machine running the server.
- Do not claim a failure is a product defect from one run. One failure is a
  lead; a failure that repeats after a re-run is evidence.
- Do not re-run more than once to chase a pass. If the second run also fails,
  classify it and move on.

## Install and config

Prerequisites: an environment that can run `npm install`, `npm test`, and
`npm run build`. The server is TypeScript, MIT-licensed, free, at
`https://github.com/hmodali2611/test-automation-mcp-server`.

```bash
npm install
npm test          # JUnit parsing + every tool end to end over an in-memory MCP transport
npm run build
```

Connect it to an MCP client (for example Claude Desktop
`claude_desktop_config.json` or Claude Code `.mcp.json`):

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

Leave the Jira variables out to keep `create_jira_bug` in draft mode. The
placeholders above (`https://your-company.atlassian.net`, `you@company.com`,
`...`) are examples only — never put a real token in a config file you share.

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

Any framework that writes JUnit XML works: Playwright, TestNG, Maven
Surefire, JUnit 5, pytest and most CI tools. See
`examples/mcp-tests.playwright-and-testng.json` in the repo for a Playwright
web suite next to an Appium + TestNG iOS suite.

## Worked example (verified in CI, 2026-11-01)

This is a real run, not a made-up scenario: GitHub Actions run 41373946277
(1m 57s). A real Android emulator booted, ApiDemos installed, and `run_tests`
ran 2 Appium tests in 7.3s: **1 passed, 1 failed**.

- The failure was a real UiAutomator2 `NoSuchElement` error for
  `testMissingElement`.
- An investigation report was saved for it.
- The passing test is identified only by elimination (2 tests total, only
  `testMissingElement` failed), not by a named pass line — do not invent a
  name for it.
- Jira filing stayed draft-only because no Jira credentials were set.

How the workflow applied:

1. `run_tests` on the Appium suite: 2 tests, 1 passed, 1 failed.
2. `get_failure_details` for `testMissingElement`: UiAutomator2
   `NoSuchElement` — the element the test looked for was not on screen.
3. Re-run once with a filter for `testMissingElement` to rule out flakiness.
4. Classify: if the element should exist and the locator is correct, this is
   `PRODUCT_DEFECT`; if the locator is stale or the screen changed, it is
   `TEST_ISSUE`. The classification depends on that evidence — do not guess
   it from the error name alone.
5. `write_investigation_report` with the classification, the NoSuchElement
   evidence, and the action.
6. `create_jira_bug` only if the classification is `PRODUCT_DEFECT` and the
   re-run confirmed it; otherwise the report is the deliverable and no bug
   is filed.

## Limitations and FAQ

- **No built-in Playwright or Appium driver.** The server runs the suite
  commands you configure and reads the JUnit XML they produce. It does not
  drive a browser or a device itself.
- **No interactive debugging.** Debugging here means inspecting failure
  details: error message, stack trace, and captured output. There are no
  breakpoints or live device control.
- **Jira is draft-only without credentials.** `create_jira_bug` files a live
  issue only when `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` are all
  set. Otherwise it writes a draft JSON file to `reports/jira-drafts/`.
- **Only configured suites run.** A suite that is not in the config file
  cannot be run, however the user phrases the request.
- **What was actually tested.** The server's own test suite runs JUnit
  parsing plus every tool end to end over an in-memory MCP transport
  (`npm test`). The Nov 1 Appium CI run above is verified in GitHub Actions.
  Live use in Claude or Copilot has **not** been tested in a live client
  session — do not claim it works there until that test is actually done.

## Permissions and external hosts

- **Local only by default.** Running suites, reading JUnit reports, reading
  test-data fixtures, and writing investigation reports and Jira drafts all
  happen on the machine running the server. No network call is made for
  those.
- **One external host: Jira Cloud, https only.** `create_jira_bug` talks to
  exactly one external service: the `JIRA_BASE_URL` configured by the
  operator, and only over `https://`. A non-https base URL is rejected before
  any request is sent, so the API token never travels over plain http. No
  other external host is contacted.
- **No data leaves the machine except to that Jira host**, and only when
  credentials are set and a bug is filed for a confirmed defect.

## License and distribution

This skill ships in the same repo as the server, free under the same MIT
license. It is not a paid listing and is not sold anywhere. If this skill is
ever listed for sale on a marketplace, that listing must be a distinct version
or carry an explicit "optional support" framing, because the version on
GitHub is free.
