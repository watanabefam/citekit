// MCP server protocol test — spawns tools/mcp-server.mjs and speaks the real protocol over
// stdio, then exercises the tools against live APIs. Deterministic where the protocol
// layer allows it; the last two assertions need the network.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROTOCOL_VERSION = '2025-06-18';
const DOI = '10.1038/s41586-023-06291-2';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.log('  \u2717 ' + name + ' \u2014 ' + e.message); }
};
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
const deep = (v) => JSON.stringify(v);

const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'mcp-server.mjs')], {
  cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
});

let nextId = 1, buf = '';
const pending = new Map(), notifications = [], parseErrors = [];
let exited = null;
srv.on('exit', (code) => { exited = code; });

srv.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { parseErrors.push(line.slice(0, 120)); continue; }
    if (msg.id === undefined) { notifications.push(msg); continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
srv.stderr.on('data', d => process.stderr.write('  [server stderr] ' + d));

const send = obj => srv.stdin.write(JSON.stringify(obj) + '\n');
function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => { if (pending.delete(id)) reject(new Error('timeout: ' + method)); }, 90000);
    send({ jsonrpc: '2.0', id, method, params });
  });
}

console.log('\nMCP server \u2014 ' + PROTOCOL_VERSION + '\n');

// ---- lifecycle -------------------------------------------------------------------
const init = await call('initialize', {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { roots: { listChanged: true } },
  clientInfo: { name: 'citekit-test', version: '1.0.0' },
});

t('initialize returns the same protocol version (spec: MUST)', () => {
  check(!init.error, 'error: ' + deep(init.error));
  check(init.result.protocolVersion === PROTOCOL_VERSION, 'got ' + init.result.protocolVersion);
});
t('initialize declares the tools capability', () => {
  check(init.result.capabilities && 'tools' in init.result.capabilities, 'no tools capability');
});
t('initialize identifies the server', () => {
  check(init.result.serverInfo.name === 'citekit', 'name ' + init.result.serverInfo.name);
  check(!!init.result.serverInfo.version, 'no version');
});

// a notification must never be answered
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
await new Promise(r => setTimeout(r, 150));

t('notifications\/initialized produced no response', () => {
  check(notifications.length === 0, notifications.length + ' unexpected response(s)');
});

const pong = await call('ping', {});
t('ping is answered', () => check(!pong.error, 'error: ' + deep(pong.error)));

// ---- tools/list ------------------------------------------------------------------
const list = await call('tools/list', {});
t('tools\/list returns the four tools', () => {
  const names = list.result.tools.map(x => x.name).sort();
  check(deep(names) === deep(['expand_citations', 'get_record', 'search_literature', 'search_web']), 'got ' + deep(names));
});
t('every tool carries name, description and an object inputSchema', () => {
  for (const tool of list.result.tools) {
    check(typeof tool.name === 'string' && tool.name, 'bad name');
    check(typeof tool.description === 'string' && tool.description.length > 40, tool.name + ': thin description');
    check(tool.inputSchema && tool.inputSchema.type === 'object', tool.name + ': no object inputSchema');
    check(tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0, tool.name + ': no properties');
  }
});
t('search_literature requires a query', () => {
  const s = list.result.tools.find(x => x.name === 'search_literature');
  check(deep(s.inputSchema.required) === deep(['query']), 'required = ' + deep(s.inputSchema.required));
});
t('search_web requires a query and advertises domain/time filters', () => {
  const s = list.result.tools.find(x => x.name === 'search_web');
  check(deep(s.inputSchema.required) === deep(['query']), 'required = ' + deep(s.inputSchema.required));
  check(!!s.inputSchema.properties.domains, 'no domains filter');
  check(!!s.inputSchema.properties.timeRange, 'no timeRange filter');
});

// ---- protocol errors -------------------------------------------------------------
const unknown = await call('tools/call', { name: 'no_such_tool', arguments: {} });
t('unknown tool is a protocol error, not a tool result (spec: -32602)', () => {
  check(unknown.error, 'expected an error object');
  check(unknown.error.code === -32602, 'code ' + unknown.error.code);
  check(!unknown.result, 'must not also carry a result');
});
const badMethod = await call('nonexistent/method', {});
t('unknown method is -32601', () => check(badMethod.error?.code === -32601, 'code ' + badMethod.error?.code));

// ---- live tool calls -------------------------------------------------------------
const got = await call('tools/call', { name: 'get_record', arguments: { doi: 'https://doi.org/' + DOI } });
t('get_record resolves a DOI (prefix form accepted)', () => {
  check(!got.result.isError, got.result.content[0].text);
  check(got.result.structuredContent.found, 'not found');
  check(got.result.structuredContent.record.title.length > 10, 'no title');
  check(got.result.structuredContent.record.doi.includes(DOI), 'doi ' + got.result.structuredContent.record.doi);
});
t('get_record returns structured content AND the same JSON as text (spec SHOULD)', () => {
  check(deep(got.result.structuredContent) === deep(JSON.parse(got.result.content[0].text)), 'they disagree');
});
const bad = await call('tools/call', { name: 'get_record', arguments: { doi: 'not-a-doi' } });
t('a bad DOI is a tool execution error, not a protocol error', () => {
  check(!bad.error, 'should not be a protocol error');
  check(bad.result.isError === true, 'isError should be true');
});

const found = await call('tools/call', {
  name: 'search_literature',
  arguments: { query: 'structured literacy dyslexia', sources: ['crossref'], per: 3, limit: 3 },
});
t('search_literature returns ranked records from a keyless source', () => {
  check(!found.result.isError, found.result.content[0].text);
  const p = found.result.structuredContent;
  check(p.records.length > 0, 'no records (' + deep(p.errors) + ')');
  check(p.records.every(r => r.title), 'a record has no title');
  check(p.records.every(r => 'id' in r && 'doi' in r), 'a record lost id/doi, so expand_citations could not seed from it');
});

const web = await call('tools/call', {
  name: 'search_web',
  arguments: { query: 'Tavily Search API', limit: 2 },
});
t('search_web returns labelled web records with extracted text', () => {
  check(!web.result.isError, web.result.content[0].text);
  const p = web.result.structuredContent;
  check(p.records.length > 0, 'no web records');
  check(p.records.every(r => r.kind === 'web' && /^https?:\/\//.test(r.url)), 'a record is not a labelled web page');
  check(p.records.every(r => typeof r.text === 'string' && r.text.length > 50), 'a record has no extracted text');
  check(p.records.every(r => r.source === 'Web' && r.provider === 'Tavily'), 'provenance missing');
});

const ex = await call('tools/call', {
  name: 'expand_citations',
  arguments: { dois: [DOI], maxSeeds: 1, limit: 5 },
});
t('expand_citations walks the graph and reports provenance', () => {
  check(!ex.result.isError, ex.result.content[0].text);
  const p = ex.result.structuredContent;
  check(p.records.length > 0, 'nothing added');
  check(p.records.some(r => r.via === 'cites-seed' || r.via === 'cited-by-seed'), 'no provenance tag on any record');
});

// ---- shutdown --------------------------------------------------------------------
srv.stdin.end();
await new Promise(r => setTimeout(r, 800));
t('closing stdin shuts the server down (spec: stdio shutdown)', () => check(exited !== null, 'did not exit'));
t('stdout carried protocol messages only (every line parsed as JSON)', () => check(parseErrors.length === 0, parseErrors[0]));

console.log('\n' + pass + '/' + (pass + fail) + ' \u2014 ' + (fail ? fail + ' FAILED' : 'all passed') + '\n');
process.exit(fail ? 1 : 0);
