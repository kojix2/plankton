import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REFERENCE_SECTIONS } from '../web/js/reference.js';
import { OPERATIONS } from '../web/js/operations.js';

const entries = REFERENCE_SECTIONS.flatMap(group => group.entries);
const source = await readFile(new URL('../src/plankton/core.cr', import.meta.url), 'utf8');

test('reference documents every texture operation and its arguments', () => {
    assert.deepEqual(entries.filter(item => item.operation).map(item => item.operation).sort(), OPERATIONS.map(op => op.name).sort());
    for (const op of OPERATIONS) {
        const item = entries.find(item => item.operation === op.name);
        assert.deepEqual(item.args.map(([name]) => name), [...(op.kind === 'combine' ? ['other'] : []), ...op.args.map(arg => arg.name)]);
    }
    assert.equal(new Set(entries.map(item => item.id)).size, entries.length);
    for (const item of entries) {
        assert.ok(item.signature && item.description && item.example, item.id);
        assert.match(item.signature, / : |Plankton::/, item.id);
        for (const [name, meaning] of item.args)
            assert.ok(name && meaning, `${item.id}: missing argument documentation`);
    }
});

test('reference covers handwritten DSL functions and public Signal, input and texture methods', () => {
    const members = new Set(entries.flatMap(item => item.members));
    const blocks = [...source.matchAll(/^  (struct|class|module|record) (\w+)/gm)];
    for (const [i, match] of blocks.entries()) {
        if (match[1] === 'record') continue;
        const type = match[2];
        const block = source.slice(match.index, blocks[i + 1]?.index ?? source.length);
        for (const method of block.matchAll(/^    def (?:self\.)?([\w+*/-]+)/gm)) {
            const name = method[1] === 'initialize' ? 'new' : method[1];
            assert.ok(members.has(`${type}.${name}`), `Missing ${type}.${name}`);
        }
    }
    for (const [, name] of source.matchAll(/^  def self\.(\w+)/gm))
        assert.ok(entries.some(item => item.id === name), `Missing Plankton.${name}`);
    const dsl = source.slice(source.indexOf('  module DSL'));
    assert.equal([...dsl.matchAll(/^    def src\(/gm)].length, entries.filter(item => item.members.includes('DSL.src')).length, 'src overloads');
});

test('reference category names resolve to translation keys', async () => {
    const english = JSON.parse(await readFile(new URL('../web/locales/en.json', import.meta.url), 'utf8'));
    for (const group of REFERENCE_SECTIONS)
        assert.ok(english[group.key], group.key);
});
