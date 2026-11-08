import { test, expect } from '@playwright/test';
import { runBrowserSuite } from './browser-suite.mjs';

test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400)
            errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    page.on('requestfailed', request => errors.push(`Request failed: ${request.url()}`));
    page.planktonErrors = errors;
    await page.goto('./?test=1');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#gpu-error')).toBeHidden();
});

test.afterEach(async ({ page }) => {
    expect(page.planktonErrors).toEqual([]);
});

test('HTTP modules, all WebGL operations, twelve presets, and nine locales', async ({ page }, testInfo) => {
    await page.screenshot({ path: testInfo.outputPath('startup.png') });
    const checks = await page.evaluate(`(async () => {
        const manifest = await (await fetch('./examples/manifest.json')).json();
        const presets = {};
        for (const example of manifest)
            presets[example.id] = await (await fetch('./' + example.preview)).json();
        const modules = {
            renderer: await import('./js/renderer.js'),
            operations: await import('./js/operations.js'),
            share: await import('./js/share.js'),
        };
        return (${runBrowserSuite.toString()})({ app: window.__planktonTest, modules, manifest, presets });
    })()`);
    expect(checks).toHaveLength(62);
    await testInfo.attach('browser-checks', { body: checks.join('\n'), contentType: 'text/plain' });
});

async function compile(page, source) {
    if (source !== undefined)
        await page.locator('#source-code').fill(source);
    await page.locator('#run-button').click();
    await expect(page.locator('#run-button')).toHaveAttribute('aria-busy', 'false', { timeout: 180000 });
    await expect(page.locator('#view-badge')).toHaveText('Compiled Crystal');
    await expect(page.locator('#console')).not.toHaveClass('error');
}

async function centerPixel(page) {
    return page.evaluate(() => {
        const renderer = window.__planktonTest.renderer;
        renderer.render(0);
        const gl = renderer.gl, bytes = new Uint8Array(4);
        gl.readPixels(Math.floor(renderer.width / 2), Math.floor(renderer.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        if (gl.getError() !== gl.NO_ERROR)
            throw new Error('WebGL pixel read failed');
        return Array.from(bytes);
    });
}

test('Run compiles the initial Crystal example and renders an animated canvas', async ({ page }, testInfo) => {
    await expect(page.locator('#view-badge')).toHaveText('Preset preview');
    await compile(page);
    await expect(page.locator('#console')).toContainText('Compiled');
    const first = await page.locator('#view').screenshot();
    await expect.poll(async () => (await page.locator('#view').screenshot()).equals(first)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('compiled.png') });
});

test('compiled sliders change real pixels; invalid Crystal preserves the last image', async ({ page }) => {
    await compile(page, 'red = param("red", 0.1, min: 0.0, max: 1.0, step: 0.1)\nsolid(red, 0, 0).out');
    await page.locator('#pause-button').click();
    const first = await centerPixel(page);
    expect(first[0]).toBeGreaterThan(20);
    expect(first[0]).toBeLessThan(30);
    const slider = page.locator('#param-red');
    await slider.focus();
    await slider.press('End');
    const second = await centerPixel(page);
    expect(second[0]).toBeGreaterThan(250);
    expect(second[1]).toBeLessThan(3);
    await page.locator('#source-code').fill('osc("wrong type").out');
    await page.locator('#run-button').click();
    await expect(page.locator('#run-button')).toHaveAttribute('aria-busy', 'false', { timeout: 180000 });
    await expect(page.locator('#console')).toHaveClass('error');
    await expect(page.locator('#console')).toContainText('Error');
    expect(await centerPixel(page)).toEqual(second);
});

test('Stop cancels an infinite Crystal program and Run recovers', async ({ page }) => {
    await page.locator('#source-code').fill('loop do\nend');
    await page.locator('#run-button').click();
    await expect(page.locator('#status-text')).toHaveText('Building the graph…', { timeout: 180000 });
    await page.locator('#stop-button').click();
    await expect(page.locator('#run-button')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#status-text')).toHaveText('Stopped');
    await compile(page, 'solid(0, 1, 0).out');
    expect((await centerPixel(page))[1]).toBeGreaterThan(250);
});

test('shared code and local drafts load without automatically compiling', async ({ page, context }) => {
    const source = '# shared code\nosc(17).out';
    await page.locator('#source-code').fill(source);
    await page.locator('#share-button').click();
    await expect(page.locator('#share-dialog')).toBeVisible();
    const url = await page.locator('#share-url').inputValue();
    const shared = await context.newPage();
    const compilerRequests = [];
    shared.on('request', request => {
        if (/compiler-worker|\/vendor\/crystal\//.test(request.url()))
            compilerRequests.push(request.url());
    });
    await shared.goto(url);
    await expect(shared.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(shared.locator('#source-code')).toHaveValue(source);
    await expect(shared.locator('#view-badge')).not.toHaveText('Compiled Crystal');
    await shared.reload();
    await expect(shared.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(shared.locator('#source-code')).toHaveValue(source);
    expect(compilerRequests).toEqual([]);
    await shared.close();
    await page.locator('#share-dialog .close-dialog').click();
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#source-code')).toHaveValue(source);
});

test('gallery, Japanese UI, resolution, PNG capture, and mobile layout', async ({ page }, testInfo) => {
    await page.locator('#gallery-button').click();
    await expect(page.locator('.gallery-card')).toHaveCount(12);
    await page.locator('[data-example="neon-lattice"]').click();
    await expect(page.locator('#project-title')).toHaveText('Neon Lattice');
    await expect(page.locator('#gallery-dialog')).not.toBeVisible();
    const source = await page.locator('#source-code').inputValue();
    await page.locator('#language').selectOption('ja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('#run-button')).toContainText('実行');
    await expect(page.locator('#source-code')).toHaveValue(source);
    await page.locator('#resolution').selectOption('540');
    await expect(page.locator('#view')).toHaveAttribute('width', '960');
    await expect(page.locator('#view')).toHaveAttribute('height', '540');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#snapshot-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('plankton.png');
    await download.saveAs(testInfo.outputPath('capture.png'));
    expect(await download.failure()).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('mobile-ja.png'), fullPage: true });
});
