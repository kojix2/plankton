import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, I18n, storage } from '../web/js/i18n.js';
const load = async (name) => JSON.parse(await readFile(new URL(`../web/locales/${name}.json`, import.meta.url), 'utf8'));
const english = await load('en');
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort();
for (const language of Object.keys(LANGUAGES))
    test(`complete locale: ${language}`, async () => {
        const messages = await load(language);
        assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort());
        for (const [key, text] of Object.entries(messages)) {
            assert.equal(typeof text, 'string');
            assert.ok(text.length, `${language}:${key}`);
            assert.deepEqual(placeholders(text), placeholders(english[key]), `${language}:${key}`);
        }
    });
test('HTML translation attributes resolve', async () => { const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8'); for (const match of html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g))
    assert.ok(Object.hasOwn(english, match[1]), match[1]); });
test('interpolation does not interpret HTML', () => { const i = new I18n(); i.english = { greeting: 'Hello {name}' }; assert.equal(i.t('greeting', { name: '<img>' }), 'Hello <img>'); assert.equal(i.t('missing'), 'missing'); });

test('Plankton storage preserves existing drafts and preferences', (t) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    t.after(() => {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
        else delete globalThis.localStorage;
    });
    const draft = JSON.stringify({ version: 1, source: 'osc(17).out', example: 'afterimage' });
    const saved = new Map([
        ['hydra-crystal:draft', draft],
        ['hydra-crystal:language', 'ja'],
        ['hydra-crystal:resolution', '540'],
        ['hydra-crystal:split', '40'],
    ]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: key => saved.get(key) ?? null,
        setItem: (key, value) => saved.set(key, value),
    } });
    assert.equal(storage.get('draft'), draft);
    assert.equal(storage.get('language'), 'ja');
    assert.equal(storage.get('resolution'), '540');
    assert.equal(storage.get('split'), '40');
    assert.equal(storage.get('missing'), null);
    storage.set('language', 'en');
    assert.equal(storage.get('language'), 'en');
    assert.equal(saved.get('plankton:language'), 'en');
    storage.set('draft', '');
    assert.equal(storage.get('draft'), '');
    assert.equal(saved.get('hydra-crystal:draft'), draft);
});
