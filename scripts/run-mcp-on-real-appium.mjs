// Run the MCP server tools against the real Appium suite above, and
// print every tool result. This script succeeds when the MCP tools
// themselves work, even though one Appium test is expected to fail.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../dist/config.js';
import { createServer } from '../dist/server.js';

const text = (r) => r.content.map((c) => c.text).join('\n');
const client = new Client({ name: 'real-appium-client', version: '1.0.0' });
const server = createServer(loadConfig('mcp-real-appium.config.json'));
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(b), client.connect(a)]);
console.log('=== run_tests real-appium-apidemos ===');
console.log(text(await client.callTool({ name: 'run_tests', arguments: { suite: 'real-appium-apidemos' } })));
console.log('\n=== get_failure_details testMissingElement ===');
console.log(text(await client.callTool({ name: 'get_failure_details', arguments: { suite: 'real-appium-apidemos', testName: 'testMissingElement' } })));
console.log('\n=== write_investigation_report ===');
console.log(text(await client.callTool({ name: 'write_investigation_report', arguments: { suite: 'real-appium-apidemos', testName: 'testMissingElement', classification: 'TEST_ISSUE', evidence: 'Real UiAutomator2 NoSuchElement response for a deliberately missing accessibility id in ApiDemos.', action: 'Fix the test locator; do not file a product bug for a missing test element.' } })));
await client.close();
