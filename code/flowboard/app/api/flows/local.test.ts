import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refused } from './local.ts';

const req = (method: string, headers: Record<string, string>) => new Request('http://localhost:3001/api/projects/clone', { method, headers: { host: 'localhost:3001', ...headers } });
const status = (r: Request) => refused(r)?.status ?? 'ok';

test('a write from another site is refused, even one a browser sends without asking first', () => {
  assert.equal(status(req('POST', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' })), 403);
  assert.equal(status(req('POST', { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-site' })), 403); // another app on this machine
  assert.equal(status(req('DELETE', { origin: 'null' })), 403);
  assert.equal(status(req('PATCH', { 'sec-fetch-site': 'cross-site' })), 403);
});

test('the app’s own pages, a typed URL and tools like curl still get through', () => {
  assert.equal(status(req('POST', { origin: 'http://localhost:3001', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' })), 'ok');
  assert.equal(status(req('POST', {})), 'ok'); // curl sends neither header
  assert.equal(status(req('GET', { 'sec-fetch-site': 'cross-site' })), 'ok'); // reads change nothing; the Host check still applies
  assert.equal(status(new Request('http://x/api', { headers: { host: 'evil.example' } })), 403);
});
