import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, I18n } from '../web/js/i18n.js';
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
