/** Runs against actual WebGL, never against a fake renderer. The caller supplies
 * loaded modules so both HTTP CI and an offline in-memory test harness can use it. */
export async function runBrowserSuite({ app, modules, presets, manifest }) {
    const results = [];
    const assert = (value, message) => { if (!value)
        throw new Error(message); };
    const test = async (name, run) => { await run(); results.push(name); };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const { Renderer } = modules.renderer;
    const { OPERATIONS } = modules.operations;
    const c = (value) => ({ op: 'const', value });
    const uniform = (op) => ({ op });
    const graph = (nodes, outputs = [nodes.length - 1, null, null, null], params = []) => ({ version: 1, nodes, outputs, params, display: 0 });
    const solid = (r, g, b) => ({ op: 'solid', args: [r, g, b, 1].map(c), inputs: [] });
    const offscreen = document.createElement('canvas');
    const renderer = new Renderer(offscreen);
    renderer.resize(160, 90);
    const pixel = () => {
        const gl = renderer.gl, bytes = new Uint8Array(4);
        gl.readPixels(80, 45, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        assert(gl.getError() === gl.NO_ERROR, 'WebGL returned an error');
        return Array.from(bytes);
    };
    try {
        await test('WebGL: constant color reaches the framebuffer', () => {
            renderer.setGraph(graph([solid(1, 0, 0)]), { clear: true });
            renderer.render(0);
            const rgba = pixel();
            assert(rgba[0] > 250 && rgba[1] < 3 && rgba[2] < 3, 'Expected a red pixel');
        });
        for (const op of OPERATIONS)
            await test(`WebGL operation: ${op.name}`, () => {
                const nodes = op.kind === 'source' ? [] : [solid(.7, .3, .1)];
                if (op.kind === 'combine')
                    nodes.push(solid(.2, .8, .4));
                nodes.push({ op: op.name, args: op.args.map((arg) => c(arg.default)), inputs: op.kind === 'source' ? [] : op.kind === 'combine' ? [0, 1] : [0] });
                renderer.setGraph(graph(nodes), { clear: true });
                renderer.render(.016);
                pixel();
            });
        await test('WebGL: every scalar expression compiles', () => {
            const signals = [uniform('time'), uniform('frame'), uniform('mouse_x'), uniform('mouse_y'), ...['sin', 'cos', 'abs', 'floor', 'fract', 'sqrt', 'neg'].map(op => ({ op, args: [c(.3)] })), ...['add', 'sub', 'mul', 'div', 'pow', 'min', 'max'].map(op => ({ op, args: [c(.3), c(.8)] })), { op: 'mix', args: [c(.1), c(.9), c(.2)] }, { op: 'clamp', args: [c(.8), c(.1), c(.9)] }];
            for (const signal of signals) {
                renderer.setGraph(graph([{ op: 'solid', args: [signal, c(.2), c(.6), c(1)], inputs: [] }]), { clear: true });
                renderer.render(.016);
                pixel();
            }
        });
        await test('WebGL: src reads the previous frame, regardless of output order', () => {
            renderer.setGraph(graph([{ op: 'src', args: [c(1)], inputs: [] }, solid(0, 1, 0)], [0, 1, null, null]), { clear: true });
            renderer.reset(); // reset() clears and renders exactly one frame.
            const first = pixel();
            renderer.render(0);
            const second = pixel();
            assert(first[1] < 3, 'First source frame must be black');
            assert(second[1] > 250, 'Second source frame must read output 1 green');
        });
        await test('WebGL: sliders update pixels without rebuilding shaders', () => {
            renderer.setGraph(graph([{ op: 'solid', args: [{ op: 'param', key: 'red' }, c(0), c(0), c(1)], inputs: [] }], [0, null, null, null], [{ key: 'red', value: .1, min: 0, max: 1, step: .01 }]), { clear: true });
            const program = renderer.program;
            renderer.render(0);
            const first = pixel();
            renderer.setParameter('red', .9);
            const second = pixel();
            assert(renderer.program === program, 'Slider recompiled a program');
            assert(second[0] - first[0] > 150, 'Slider did not update pixels');
        });
        await test('WebGL: bad graphs preserve the last good program', () => {
            const old = renderer.program;
            try {
                renderer.setGraph(graph([{ op: 'eval', args: [], inputs: [] }]));
                throw new Error('Invalid graph was accepted');
            }
            catch (error) {
                assert(!error.message.includes('was accepted'), error.message);
            }
            assert(renderer.program === old, 'Existing program was destroyed');
            renderer.render(0);
            pixel();
        });
        for (const example of manifest)
            await test(`WebGL preset: ${example.id}`, () => {
                renderer.setGraph(presets[example.id], { clear: true, preserveParameters: false });
                for (let i = 0; i < 8; i++)
                    renderer.render(.05);
                pixel();
            });
        await test('WebGL: resizing and releasing targets', () => {
            renderer.resize(320, 180);
            renderer.render(.016);
            assert(renderer.gl.getError() === 0, 'Resize caused a GL error');
            renderer.resize(160, 90);
            renderer.render(.016);
            pixel();
        });
    }
    finally {
        renderer.dispose();
    }
    assert(app.renderer, 'App has no WebGL renderer');
    app.renderer.pause();
    await test('UI: initial preview is explicitly marked as a preset', () => {
        assert(document.querySelector('#view-badge').textContent.length > 0, 'No preview badge');
        assert(document.querySelector('#parameters').querySelectorAll('input').length === 2, 'Initial sliders missing');
    });
    await test('UI: syntax highlighting escapes markup instead of executing it', () => {
        app.editor.value = '# <img src=x onerror=alert(1)>\nosc(5).out\n';
        assert(!document.querySelector('#editor img'), 'Editor interpreted HTML');
    });
    await test('UI: editing sets the dirty badge', () => {
        const input = document.querySelector('#source-code');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        assert(!document.querySelector('#edited-dot').hidden, 'Edited indicator missing');
    });
    await test('UI: all nine locales preserve code', async () => {
        const source = app.editor.value, select = document.querySelector('#language');
        for (const language of ['ja', 'zh-CN', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru', 'en']) {
            select.value = language;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            for (let i = 0; i < 100 && document.documentElement.lang !== language; i++)
                await wait(10);
            assert(document.documentElement.lang === language, `Locale did not load: ${language}`);
            await wait(10);
            assert(app.editor.value === source, 'Language change overwrote source');
        }
    });
    await test('UI: all twelve gallery entries load without compilation', async () => {
        for (const example of manifest) {
            await app.loadExample(example.id);
            app.renderer.pause();
            assert(app.renderer.graph.nodes.length === presets[example.id].nodes.length, 'Wrong graph loaded');
            assert(!app.compiler.worker, 'Preset unexpectedly invoked the compiler');
        }
        await app.loadExample(manifest[0].id);
        app.renderer.pause();
    });
    await test('UI: pause, resume, and stop', () => {
        document.querySelector('#pause-button').click();
        assert(app.renderer.running, 'Play did not start');
        document.querySelector('#pause-button').click();
        assert(!app.renderer.running, 'Pause did not stop');
        document.querySelector('#pause-button').click();
        document.querySelector('#stop-button').click();
        assert(!app.renderer.running && !app.compiler.worker, 'Stop left work running');
    });
    await test('UI: reference and GLSL dialogs', () => {
        document.querySelector('#api-button').click();
        assert(document.querySelector('#api-dialog').open, 'Reference did not open');
        assert(document.querySelectorAll('.api-entry').length === 36, 'Wrong API entry count');
        document.querySelector('#api-dialog').close();
        document.querySelector('#shader-button').click();
        assert(document.querySelector('#shader-code').textContent.includes('#version 300 es'), 'No shader text');
        document.querySelector('#shader-dialog').close();
    });
    await test('UI: share round trip uses code, not executable JavaScript', async () => {
        const href = await modules.share.createShareURL(app.editor.value, 'https://example.org/repository/', 'ja');
        assert(await modules.share.readSharedSource(new URL(href).hash) === app.editor.value, 'Share round trip changed source');
    });
    return results;
}
