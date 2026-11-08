import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    page.inputErrors = errors;
    await page.goto('./?test=1');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
});

test.afterEach(async ({ page }) => { expect(page.inputErrors).toEqual([]); });

async function compile(page, source) {
    await page.locator('#source-code').fill(source);
    await page.locator('#run-button').click();
    await expect(page.locator('#run-button')).toHaveAttribute('aria-busy', 'false', { timeout: 180000 });
    await expect(page.locator('#view-badge')).toHaveText('Compiled Crystal');
    await expect(page.locator('#console')).not.toHaveClass('error');
}

async function pixel(page, x = .5, y = .5) {
    return page.evaluate(([x, y]) => {
        const r = window.__hydraTest.renderer, gl = r.gl, data = new Uint8Array(4);
        r.render(0);
        gl.readPixels(Math.floor(r.width * x), Math.floor(r.height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
        if (gl.getError()) throw new Error('WebGL reported an error');
        return Array.from(data);
    }, [x, y]);
}

async function imageFile(page, color = 'red') {
    const base64 = await page.evaluate(color => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.fillRect(0, 0, 32, 16);
        context.fillStyle = 'blue';
        context.fillRect(0, 16, 32, 16);
        return canvas.toDataURL('image/png').split(',')[1];
    }, color);
    return { name: 'test-pattern.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

test('local images reach GPU pixels upright, replacement is live, clearing restores black', async ({ page }, testInfo) => {
    await page.locator('#inputs-button').click();
    await page.locator('#media-file').setInputFiles(await imageFile(page));
    await expect(page.locator('.input-card').first()).toContainText('test-pattern.png');
    await page.locator('#inputs-dialog .close-dialog').click();
    await compile(page, 'src(s0).out');
    await page.locator('#pause-button').click();
    expect((await pixel(page, .5, .75)).slice(0, 3)).toEqual([255, 0, 0]);
    expect((await pixel(page, .5, .25)).slice(0, 3)).toEqual([0, 0, 255]);
    await page.locator('#inputs-button').click();
    await page.locator('#media-file').setInputFiles(await imageFile(page, 'lime'));
    await expect.poll(async () => (await pixel(page, .5, .75))[1]).toBe(255);
    await expect(page.locator('#view-badge')).toHaveText('Compiled Crystal');
    await page.screenshot({ path: testInfo.outputPath('media-inputs.png') });
    await page.locator('#media-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await expect(page.locator('#input-message')).toContainText('Cannot decode');
    expect((await pixel(page, .5, .75)).slice(0, 3)).toEqual([0, 255, 0]);
    await page.locator('#clear-input-button').click();
    expect((await pixel(page)).slice(0, 3)).toEqual([0, 0, 0]);
});

test('all four media inputs can render to independent output buffers', async ({ page }) => {
    await page.locator('#inputs-button').click();
    const colors = ['red', 'lime', 'blue', 'white'];
    for (let i = 0; i < 4; i++) {
        await page.locator('#input-slot').selectOption(String(i));
        await page.locator('#media-file').setInputFiles(await imageFile(page, colors[i]));
        await expect(page.locator('.input-card').nth(i)).toContainText('test-pattern.png');
    }
    await page.locator('#inputs-dialog .close-dialog').click();
    await compile(page, colors.map((_, i) => `src(s${i}).out(o${i})`).join('\n'));
    await page.locator('#pause-button').click();
    const expected = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]];
    for (let i = 0; i < 4; i++) {
        await page.locator('#output-select').selectOption({ index: i });
        expect((await pixel(page, .5, .75)).slice(0, 3)).toEqual(expected[i]);
    }
});

test('video file decodes, follows pause, seek, speed and one-frame stepping', async ({ page }) => {
    const base64 = await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d'), stream = canvas.captureStream(15);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        const chunks = [];
        recorder.ondataavailable = event => chunks.push(event.data);
        const finished = new Promise(resolve => { recorder.onstop = resolve; });
        recorder.start();
        for (let frame = 0; frame < 24; frame++) {
            context.fillStyle = frame < 12 ? 'red' : 'lime';
            context.fillRect(0, 0, 64, 64);
            await new Promise(resolve => setTimeout(resolve, 70));
        }
        recorder.stop();
        await finished;
        stream.getTracks().forEach(track => track.stop());
        const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    });
    await page.locator('#pause-button').click();
    await page.locator('#inputs-button').click();
    await page.locator('#media-file').setInputFiles({ name: 'test-video.webm', mimeType: 'video/webm', buffer: Buffer.from(base64, 'base64') });
    await expect(page.locator('.input-card').first()).toContainText('test-video.webm');
    await page.locator('#inputs-dialog .close-dialog').click();
    await compile(page, 'src(s0).out');
    await page.locator('#pause-button').click();
    await expect.poll(() => page.evaluate(() => window.__hydraTest.inputs.slots[0].element.paused)).toBe(true);
    // MediaRecorder WebM may lack a finite duration; decode metadata by seeking.
    await page.evaluate(async () => {
        const video = window.__hydraTest.inputs.slots[0].element;
        if (!Number.isFinite(video.duration)) {
            video.currentTime = 100;
            await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
        }
    });
    await page.locator('#time-position').fill('1.2');
    await page.locator('#seek-button').click();
    await expect.poll(() => page.evaluate(() => window.__hydraTest.inputs.slots[0].element.currentTime)).toBeCloseTo(1.2, 1);
    await expect.poll(async () => (await pixel(page))[1]).toBeGreaterThan(230);
    await page.locator('#time-speed').focus();
    await page.locator('#time-speed').press('End');
    await page.locator('#pause-button').click();
    await expect.poll(() => page.evaluate(() => window.__hydraTest.inputs.slots[0].element.playbackRate)).toBe(4);
    await page.locator('#pause-button').click();
    await page.locator('#time-position').fill('0.2');
    await page.locator('#seek-button').click();
    await expect.poll(async () => (await pixel(page))[0]).toBeGreaterThan(230);
    await page.locator('#step-button').click();
    await expect.poll(() => page.evaluate(() => window.__hydraTest.inputs.slots[0].element.currentTime)).toBeCloseTo(.2 + 1 / 60, 2);
});

test('camera capture uses a test device and Stop releases its tracks', async ({ page }) => {
    expect(await page.evaluate(() => window.__hydraTest.inputs.slots.every(slot => slot === null))).toBe(true);
    await page.locator('#inputs-button').click();
    await page.locator('#camera-button').click();
    await expect(page.locator('.input-card').first()).toContainText('Camera:');
    await page.evaluate(() => { window.cameraTracks = window.__hydraTest.inputs.slots[0].stream.getTracks(); });
    await page.locator('#inputs-dialog .close-dialog').click();
    await compile(page, 'src(s0).kaleid(3).out');
    await expect.poll(async () => Math.max(...(await pixel(page)).slice(0, 3))).toBeGreaterThan(20);
    await page.locator('#stop-button').click();
    expect(await page.evaluate(() => window.cameraTracks.every(track => track.readyState === 'ended'))).toBe(true);
    expect((await pixel(page)).slice(0, 3)).toEqual([0, 0, 0]);
});

test('a real oscillator stream passes through microphone FFT, gain, uniforms and cleanup', async ({ page }) => {
    // Deterministic generated sound, never the user's physical microphone.
    await page.evaluate(() => {
        const context = new AudioContext(), oscillator = context.createOscillator();
        const gain = context.createGain(), destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 440;
        gain.gain.value = .4;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        window.toneContext = context;
        navigator.mediaDevices.getUserMedia = async () => { await context.resume(); return destination.stream; };
    });
    await page.locator('#inputs-button').click();
    await page.locator('#mic-button').click();
    await expect(page.locator('#mic-status')).toHaveText('On');
    await expect.poll(() => page.evaluate(() => Math.max(...window.__hydraTest.inputs.fft))).toBeGreaterThan(.1);
    const peak = await page.evaluate(() => { const a = window.__hydraTest.inputs.fft; return Array.from(a).indexOf(Math.max(...a)); });
    expect(peak).toBeGreaterThan(10);
    expect(peak).toBeLessThan(18);
    await page.locator('#inputs-dialog .close-dialog').click();
    await compile(page, `solid(audio.level, audio.fft(${peak}), 0).out`);
    const before = await pixel(page);
    expect(before[0]).toBeGreaterThan(50);
    expect(before[1]).toBeGreaterThan(20);
    await page.locator('#inputs-button').click();
    await page.locator('#audio-gain').focus();
    await page.locator('#audio-gain').press('End');
    await expect.poll(async () => (await pixel(page))[0]).toBeGreaterThan(250);
    await page.evaluate(() => { window.micTracks = window.__hydraTest.inputs.microphone.getTracks(); });
    await page.locator('#mic-button').click();
    await expect(page.locator('#mic-status')).toHaveText('Off');
    expect(await page.evaluate(() => window.micTracks.every(track => track.readyState === 'ended'))).toBe(true);
    expect((await pixel(page)).slice(0, 3)).toEqual([0, 0, 0]);
    await page.evaluate(() => window.toneContext.close());
});

test('permission denial is recoverable and late camera permission is cancelled by Stop', async ({ page }) => {
    await page.locator('#inputs-button').click();
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test permission denied', 'NotAllowedError'); }; });
    await page.locator('#camera-button').click();
    await expect(page.locator('#input-message')).toContainText('Test permission denied');
    await expect(page.locator('#camera-button')).toBeEnabled();
    await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.grantCamera = resolve; });
    });
    await page.locator('#camera-button').click();
    await expect(page.locator('#camera-button')).toBeDisabled();
    await page.locator('#inputs-dialog .close-dialog').click();
    await page.locator('#stop-button').click();
    await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        window.lateStream = canvas.captureStream(1);
        window.grantCamera(window.lateStream);
    });
    await expect.poll(() => page.evaluate(() => window.lateStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    expect(await page.evaluate(() => window.__hydraTest.inputs.slots[0])).toBeNull();
});

test('clock speed, BPM, seek and frame step drive compiled shader uniforms', async ({ page }) => {
    await compile(page, 'solid((time * 0.1).fract, beat.fract, delta * 10).out');
    await page.locator('#pause-button').click();
    await page.locator('#time-position').fill('1.5');
    await page.locator('#seek-button').click();
    const first = await pixel(page);
    expect(first[0]).toBeGreaterThan(35);
    expect(first[0]).toBeLessThan(42);
    expect(first[1]).toBeLessThan(3);
    await page.locator('#bpm').fill('60');
    await page.locator('#bpm').press('Tab');
    expect((await pixel(page))[1]).toBeGreaterThan(125);
    await page.locator('#time-speed').focus();
    await page.locator('#time-speed').press('Home');
    await page.locator('#pause-button').click();
    await expect.poll(() => page.evaluate(() => window.__hydraTest.renderer.time)).toBe(1.5);
    await page.locator('#step-button').click();
    expect(await page.evaluate(() => window.__hydraTest.renderer.time)).toBeCloseTo(1.5 + 1 / 60, 8);
    expect(await page.evaluate(() => window.__hydraTest.renderer.running)).toBe(false);
    await page.locator('#reset-button').click();
    expect(await page.evaluate(() => window.__hydraTest.renderer.time)).toBe(0);
    await page.locator('#time-speed').focus();
    await page.locator('#time-speed').press('End');
    await page.locator('#pause-button').click();
    await page.locator('#time-position').fill('20');
    await page.locator('#bpm').focus();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#time-position')).toHaveValue('20');
    await page.locator('#seek-button').click();
    await page.locator('#pause-button').click();
    const time = await page.evaluate(() => window.__hydraTest.renderer.time);
    expect(time).toBeGreaterThanOrEqual(20);
    expect(time).toBeLessThan(22);
});

test('reload and shared links do not reacquire devices or restore local files', async ({ page }) => {
    await page.locator('#inputs-button').click();
    await page.locator('#camera-button').click();
    await expect(page.locator('.input-card').first()).toContainText('Camera:');
    await page.addInitScript(() => {
        window.deviceRequests = 0;
        navigator.mediaDevices.getUserMedia = async () => { window.deviceRequests++; throw new Error('Must not acquire a device automatically'); };
    });
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => window.deviceRequests)).toBe(0);
    expect(await page.evaluate(() => window.__hydraTest.inputs.slots.every(slot => slot === null))).toBe(true);
    expect(await page.evaluate(() => window.__hydraTest.inputs.microphone)).toBeNull();
    await page.locator('#source-code').fill('src(s0).brightness(audio.level).out');
    await page.locator('#share-button').click();
    const url = await page.locator('#share-url').inputValue();
    await page.goto(url);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#source-code')).toHaveValue('src(s0).brightness(audio.level).out');
    expect(await page.evaluate(() => window.deviceRequests)).toBe(0);
});

test('Japanese inputs and time controls fit a mobile viewport', async ({ page }, testInfo) => {
    await page.locator('#language').selectOption('ja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.locator('#inputs-button').click();
    await expect(page.locator('#inputs-dialog')).toContainText('映像・音声入力');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('inputs-mobile-ja.png'), fullPage: true });
});
