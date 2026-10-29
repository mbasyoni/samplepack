/** Independent regression tests. Node DOM stubs are not a real-browser acceptance test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../core.mjs';

test('independent: 1,000 deterministic randomized quoted CSV roundtrips', () => {
  let seed = 17;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const alphabet = ['a', ',', '"', '\r', '\n', 'é', '一', ' ', '=', '\t'];
  // Independent serializer, rather than the implementation's escapeCell.
  const quote = value => `"${value.replace(/"/g, '""')}"`;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const rows = Array.from({length: 1 + rand() % 8}, () =>
      Array.from({length: 4}, () => Array.from({length: rand() % 30}, () =>
        alphabet[rand() % alphabet.length]).join('')));
    const csv = [['id', 'batch', 'date', 'notes'], ...rows]
      .map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
    assert.deepEqual(core.parseCSV(csv).rows, rows, `iteration ${iteration}`);
  }
});

test('independent: exact and exceeded production row, column, cell and byte limits', () => {
  const records = n => 'id\n' + Array.from({length: n}, (_, i) => i).join('\n');
  assert.equal(core.parseCSV(records(10000)).rows.length, 10000);
  assert.throws(() => core.parseCSV(records(10001)), {code: 'ROW_LIMIT'});
  const columns = n => Array.from({length: n}, (_, i) => `c${i}`).join(',');
  assert.equal(core.parseCSV(columns(100)).headers.length, 100);
  assert.throws(() => core.parseCSV(columns(101)), {code: 'COLUMN_LIMIT'});
  assert.equal(core.parseCSV('id\n' + 'x'.repeat(100000)).rows[0][0].length, 100000);
  assert.throws(() => core.parseCSV('id\n' + 'x'.repeat(100001)), {code: 'CELL_LIMIT'});
  // Ten sub-limit fields, plus commas, header and record delimiter, total exactly 1 MB.
  const header = columns(10) + '\n';
  const payloadSize = 1000000 - header.length - 9;
  const fields = Array.from({length: 10}, (_, i) => 'x'.repeat(Math.floor(payloadSize / 10) + (i < payloadSize % 10 ? 1 : 0)));
  const csv = header + fields.join(',');
  assert.equal(new TextEncoder().encode(csv).length, 1000000);
  assert.equal(core.parseCSV(csv).rows.length, 1);
  assert.throws(() => core.parseCSV(csv + 'x'), {code: 'FILE_LIMIT'});
});

const appSource = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
function harness() {
  const nodes = new Map(), digests = [];
  class Element {
    constructor() { this.handlers = {}; this.children = []; this.hidden = false; this.checked = false; this.disabled = false; this.value = ''; this.textContent = ''; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    addEventListener(event, handler) { this.handlers[event] = handler; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    add(option) { this.children.push(option); if (this.children.length === 1) this.value = option.value; }
    click() {} remove() {}
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = { ...core, TextEncoder, TextDecoder, Uint8Array, setTimeout, Blob, URL,
    crypto: {subtle: {digest: () => new Promise(resolve => digests.push(resolve))}},
    document: {getElementById: get, createElement: () => new Element(), createTextNode: text => ({textContent: text}), body: new Element()},
    Option: function(text, value) { return {text, value}; }
  };
  vm.createContext(context);
  // Inject actual core exports; execute actual application body in an isolated fake DOM.
  assert.match(appSource, /^import[^\n]*from '\.\/core\.mjs';\n/);
  vm.runInContext(appSource.replace(/^import[^\n]*\n/, ''), context);
  return {get, digests, click: id => get(id).handlers.click(),
    upload: file => get('file').handlers.change({target: {files: [file]}})};
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const digestResult = () => new Uint8Array(32).buffer;

test('independent: reset during pending SHA-256 cannot restore loaded manifest', async () => {
  const h = harness(); h.click('example'); assert.equal(h.digests.length, 1);
  h.click('reset'); h.digests[0](digestResult()); await settle();
  assert.equal(h.get('mapping-section').hidden, true);
  assert.equal(h.get('file-info').textContent, 'Your file stays in this browser. No upload service or analytics.');
});

test('independent: newer load wins when SHA-256 resolves out of order', async () => {
  const h = harness(); h.click('example'); h.click('problem');
  h.digests[1](digestResult()); await settle();
  assert.match(h.get('file-info').textContent, /synthetic-review-needed/);
  h.digests[0](digestResult()); await settle();
  assert.match(h.get('file-info').textContent, /synthetic-review-needed/);
});

test('independent: reset during pending file read prevents starting stale digest', async () => {
  const h = harness(); let finishRead;
  const pending = h.upload({size: 4, name: 'delayed.csv', arrayBuffer: () => new Promise(resolve => {finishRead = resolve;})});
  h.click('reset'); finishRead(new TextEncoder().encode('id\nZ').buffer); await pending;
  assert.equal(h.get('mapping-section').hidden, true);
  assert.equal(h.digests.length, 0);
});

function primeStaleControls(h) {
  h.get('error').hidden = false; h.get('error').textContent = 'Previous error';
  h.get('confirm').checked = true; h.get('analyze').disabled = false;
  h.get('trim').checked = true; h.get('file-info').textContent = 'old.csv · 3 records';
}

test('independent regression: pending file read immediately clears stale controls', async () => {
  const h = harness(); primeStaleControls(h); let finishRead;
  const pending = h.upload({size: 4, name: 'delayed.csv', arrayBuffer: () => new Promise(resolve => {finishRead = resolve;})});
  assert.equal(h.get('error').hidden, true);
  assert.equal(h.get('confirm').checked, false);
  assert.equal(h.get('analyze').disabled, true);
  assert.equal(h.get('trim').checked, false);
  assert.equal(h.get('file-info').textContent, 'Reading file…');
  h.click('reset'); finishRead(new TextEncoder().encode('id\nZ').buffer); await pending;
});

test('independent regression: oversize selection clears stale consent and disables Analyze', async () => {
  const h = harness(); primeStaleControls(h); let read = false;
  await h.upload({size: 1000001, name: 'large.csv', arrayBuffer: async () => {read = true; return new ArrayBuffer(0);}});
  assert.equal(read, false);
  assert.equal(h.get('confirm').checked, false);
  assert.equal(h.get('analyze').disabled, true);
  assert.equal(h.get('trim').checked, false);
  assert.equal(h.get('file-info').textContent, 'No manifest loaded.');
  assert.equal(h.get('error').hidden, false);
});
