# Test Automation MCP Server

[![CI](https://github.com/hmodali2611/test-automation-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/hmodali2611/test-automation-mcp-server/actions/workflows/ci.yml)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants (Claude, GitHub Copilot, Cursor) safe, structured access to a test automation stack. From a chat, an assistant can run a suite, read why tests failed, pull test data, and file a Jira bug with the evidence.

```text
"Run the checkout suite and file bugs for anything that's a real defect."

 assistant ──▶ run_tests(sample-e2e)          6 tests: 3 passed, 2 failed, 1 skipped
           ──▶ get_failure_details(promo)     Expected "$39.20" Received "$49.00" · API: PROMO_EXPIRED
           ──▶ run_tests(filter: "order")     still times out → flaky / environment, no bug
           ──▶ query_test_data(promoCodes)    SPRING10 is marked expired in test data → test data issue
           ──▶ create_jira_bug(...)           only for confirmed product defects
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_test_suites` | Lists configured suites, their commands and report paths |
| `run_tests` | Runs a suite (optionally filtered to matching tests) and returns pass/fail counts plus each failure |
| `get_test_results` | Summarizes the latest JUnit report without re-running |
| `get_failure_details` | Error message, stack trace and captured output for a failing test |
| `query_test_data` | Looks up accounts, products, promo codes, etc. from a JSON fixture file |
| `create_jira_bug` | Files a Jira Cloud bug; writes a draft file instead when no credentials are set |

Prompt: `triage_failures` walks the assistant through run → inspect → re-run to rule out flakiness → classify (product defect, test issue, environment) → file bugs only for real defects.

## Works with any framework that writes JUnit XML

Playwright, TestNG, Maven Surefire, JUnit 5, pytest and most CI tools all produce JUnit XML, so one parser covers web and mobile suites. See `examples/mcp-tests.playwright-and-testng.json` for a Playwright web suite next to an Appium + TestNG iOS suite.

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

## Quick start

```bash
npm install
npm test          # 10 tests: JUnit parsing + every tool end to end over an in-memory MCP transport
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

## Design choices

- **The model never gets a raw shell.** It can only run suites defined in the config file. Test filters are shell-quoted, so a test name cannot inject commands.
- **Small, model-friendly outputs.** Tools return counts and one line per failure; details come only when asked. That keeps context windows small on large suites.
- **Errors are tool results, not crashes.** A bad suite name or a missing report comes back as `isError: true` with a clear message the assistant can act on.
- **Safe by default.** Jira writes are drafts until credentials are provided, and read-only tools are annotated `readOnlyHint`.

## Tech

TypeScript · MCP TypeScript SDK · Zod · Vitest · JUnit XML · Jira Cloud REST API

## License

MIT
