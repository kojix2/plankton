import { Renderer } from './renderer.js';
import { CompilerClient } from './compiler-client.js';
import { Editor } from './editor.js';
import { I18n, LANGUAGES, storage } from './i18n.js';
import { createShareURL, readSharedSource } from './share.js';
import { LIMITS, graphStats, validateGraph } from './graph.js';
import { OPERATIONS } from './operations.js';
import { Inputs } from './inputs.js';
const $ = (id) => document.getElementById(id);
const i18n = new I18n();
const t = (key, args) => i18n.t(key, args);
const asset = (relative) => new URL(`../${relative}`, import.meta.url);
const encoder = new TextEncoder();
let renderer, editor, compiler, inputs, manifest = [], currentExample, templateSource = '', renderedSource = null;
let lastValidSource = '', busy = false, revision = 0, saveTimer, statusKey = 'ready', statusValues = {};
let config = { mode: 'local' };
let inputPending = 0;
let seekEdited = false;
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
async function fetchAsset(path, asJSON = false) {
    const response = await fetch(asset(path));
    if (!response.ok)
        throw new Error(`Cannot load ${path} (${response.status}). Build the app and serve dist over HTTP.`);
    return asJSON ? response.json() : response.text();
}
function log(message, error = false, replace = false) {
    const console = $('console');
    console.classList.toggle('error', error);
    console.textContent = (replace ? String(message) : `${console.textContent}\n${message}`).trim().slice(-30000);
    console.scrollTop = console.scrollHeight;
    if (error)
        editor?.markError(String(message));
}
function status(key, values = {}, error = false) {
    statusKey = key;
    statusValues = values;
    $('status-text').textContent = t(key, values);
    $('status-text').classList.toggle('error', error);
}
function download(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function title(id) { return id.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
function saveDraft() {
    if (!editor)
        return;
    storage.set('draft', JSON.stringify({ version: 1, source: editor.value, example: currentExample?.id }));
}
function updateBadges() {
    if (!editor)
        return;
    const edited = renderedSource === null ? editor.value !== templateSource : editor.value !== renderedSource;
    const badge = $('view-badge');
    badge.textContent = t(edited ? 'edited' : renderedSource === null ? 'preview' : 'compiled');
    badge.classList.toggle('edited', edited);
    $('edited-dot').hidden = !edited;
    $('preview-note').hidden = renderedSource !== null && !edited;
    $('preview-note').textContent = t(renderedSource === null ? 'previewHint' : 'lastGoodView');
    $('pause-button').textContent = t(renderer?.running ? 'pause' : 'resume');
    $('stop-button').disabled = !busy && !inputPending && !renderer?.running && !inputs?.microphone && !inputs?.slots.some(slot => slot?.kind === 'camera');
    $('run-button').setAttribute('aria-busy', String(busy));
}
function refreshGraphUI() {
    if (!renderer?.graph)
        return;
    const graph = renderer.graph, stats = graphStats(graph);
    $('node-count').textContent = t('nodeCount', { count: stats.nodes });
    $('output-select').selectedIndex = renderer.display;
    $('patch-strip').replaceChildren(...graph.nodes.map((node, index) => {
        const chip = document.createElement('span');
        chip.className = `patch-node${node.inputs.length ? '' : ' source'}`;
        chip.textContent = node.op;
        chip.title = `#${index}${node.inputs.length ? ' ← ' + node.inputs.map((id) => `#${id}`).join(', ') : ''}`;
        return chip;
    }));
    const rack = $('parameters');
    rack.replaceChildren();
    if (!graph.params.length) {
        const note = document.createElement('p');
        note.className = 'empty';
        note.textContent = t('parametersEmpty');
        rack.append(note);
    }
    for (const param of graph.params) {
        const wrapper = document.createElement('div');
        wrapper.className = 'parameter';
        const label = document.createElement('label');
        label.className = 'parameter-label';
        label.htmlFor = `param-${param.key}`;
        const name = document.createElement('span');
        name.textContent = param.key;
        const output = document.createElement('output');
        output.htmlFor = `param-${param.key}`;
        const format = (value) => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: param.step < 1 ? 1 : 0, maximumFractionDigits: 4 }).format(value);
        output.textContent = format(renderer.parameters.get(param.key));
        const input = document.createElement('input');
        input.type = 'range';
        input.id = `param-${param.key}`;
        input.min = param.min;
        input.max = param.max;
        input.step = param.step;
        input.value = renderer.parameters.get(param.key);
        input.addEventListener('input', () => { renderer.setParameter(param.key, Number(input.value)); output.textContent = format(renderer.parameters.get(param.key)); });
        label.append(name, output);
        wrapper.append(label, input);
        rack.append(wrapper);
    }
    $('sample-description').textContent = currentExample ? t(`desc_${currentExample.id}`) : '';
    updateBadges();
}
function renderGallery() {
    $('gallery-grid').replaceChildren(...manifest.map((example) => {
        const button = document.createElement('button');
        button.className = 'gallery-card';
        button.dataset.example = example.id;
        const image = document.createElement('img');
        image.src = asset(`presets/${example.id}.png`).href;
        image.alt = '';
        image.loading = 'lazy';
        image.width = 320;
        image.height = 180;
        image.addEventListener('error', () => { image.hidden = true; }, { once: true });
        const text = document.createElement('span');
        text.className = 'gallery-text';
        const name = document.createElement('strong');
        name.textContent = title(example.id);
        const description = document.createElement('small');
        description.textContent = t(`desc_${example.id}`);
        text.append(name, description);
        button.append(image, text);
        button.addEventListener('click', () => loadExample(example.id, true).catch(report));
        return button;
    }));
}
function renderAPI() {
    const target = $('api-list');
    target.replaceChildren();
    const note = document.createElement('p');
    note.textContent = t('apiTechnical');
    target.append(note);
    for (const [kind, key] of [['source', 'apiSource'], ['transform', 'apiTransform'], ['combine', 'apiCombine']]) {
        const section = document.createElement('section'), heading = document.createElement('h3');
        heading.textContent = t(key);
        section.append(heading);
        for (const op of OPERATIONS.filter((item) => item.kind === kind)) {
            const div = document.createElement('div');
            div.className = 'api-entry';
            const code = document.createElement('code');
            code.textContent = `${kind === 'source' ? '' : '.'}${op.name}(${[...(kind === 'combine' ? ['texture'] : []), ...op.args.map((arg) => `${arg.name} = ${arg.default}`)].join(', ')})`;
            const desc = document.createElement('p');
            desc.textContent = op.description;
            div.append(code, desc);
            section.append(div);
        }
        target.append(section);
    }
}
function report(error) { if (error?.name === 'AbortError')
    return; status('failed', {}, true); log(error?.message ?? String(error), true); }
function markBusy(value) {
    busy = value;
    $('progress').hidden = !value;
    $('progress').value = 0;
    updateBadges();
}
async function loadExample(id, ask = false) {
    const example = manifest.find((entry) => entry.id === id);
    if (!example)
        throw new Error('Unknown example.');
    if (ask && editor.value !== templateSource && !confirm(t('replaceConfirm')))
        return;
    const token = ++revision;
    compiler.cancel();
    markBusy(false);
    const [source, graph] = await Promise.all([fetchAsset(example.source), fetchAsset(example.preview, true)]);
    if (token !== revision)
        return;
    if (encoder.encode(source).length > LIMITS.sourceBytes)
        throw new Error(t('sourceTooLarge'));
    seekEdited = false;
    renderer?.setGraph(validateGraph(graph), { clear: true, preserveParameters: false });
    currentExample = example;
    templateSource = source;
    renderedSource = null;
    lastValidSource = source;
    editor.value = source;
    $('project-title').textContent = title(example.id);
    $('console-badge').textContent = '';
    if (renderer && !prefersReducedMotion)
        renderer.resume();
    refreshGraphUI();
    status('ready');
    log(t('initialLog'), false, true);
    if ($('gallery-dialog').open)
        $('gallery-dialog').close();
    saveDraft();
}
async function compile() {
    const token = ++revision, source = editor.value;
    markBusy(true);
    status('loading');
    $('console-badge').textContent = '';
    try {
        const result = await compiler.run(source);
        if (token !== revision)
            return;
        if (editor.value !== source) {
            log(t('changedDuringCompile'));
            status('ready');
            return;
        }
        if (!renderer)
            throw new Error('WebGL is unavailable.');
        renderer.setGraph(result.graph);
        renderedSource = source;
        if (!prefersReducedMotion)
            renderer.resume();
        const stats = graphStats(result.graph);
        const values = { ms: Math.round(result.compileMs), nodes: stats.nodes, passes: stats.passes };
        log([t('compileSuccess', values), result.log].filter(Boolean).join('\n'), false, true);
        $('console-badge').textContent = `${values.ms} ms`;
        status(renderer.running ? 'liveStatus' : 'pausedStatus');
        refreshGraphUI();
        saveDraft();
    }
    catch (error) {
        if (token === revision)
            report(error);
    }
    finally {
        if (token === revision)
            markBusy(false);
    }
}
function pauseOrResume() {
    if (!renderer)
        return;
    if (renderer.running)
        renderer.pause();
    else
        renderer.resume();
    if (!busy)
        status(renderer.running ? 'liveStatus' : 'pausedStatus');
    updateBadges();
}
function saveSource() {
    download(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }), `${currentExample?.id ?? 'sketch'}.cr`);
    saveDraft();
    log(t('sourceSaved'));
}
function changeResolution() {
    if (!renderer)
        return;
    const height = Number($('resolution').value), width = Math.round(height * 16 / 9);
    renderer.resize(width, height);
    $('canvas-resolution').textContent = `${width} × ${height}`;
    storage.set('resolution', String(height));
}
function installSplitter() {
    const splitter = $('splitter'), space = document.querySelector('.workspace');
    const set = (value) => { value = Math.max(28, Math.min(65, value)); document.documentElement.style.setProperty('--split', `${value}%`); splitter.setAttribute('aria-valuenow', String(Math.round(value))); storage.set('split', String(value)); };
    const saved = Number(storage.get('split'));
    if (saved >= 28 && saved <= 65)
        set(saved);
    splitter.addEventListener('pointerdown', (event) => { splitter.setPointerCapture(event.pointerId); event.preventDefault(); });
    splitter.addEventListener('pointermove', (event) => { if (!splitter.hasPointerCapture(event.pointerId))
        return; const box = space.getBoundingClientRect(); set((event.clientX - box.left) / box.width * 100); });
    splitter.addEventListener('pointerup', (event) => { if (splitter.hasPointerCapture(event.pointerId))
        splitter.releasePointerCapture(event.pointerId); });
    splitter.addEventListener('dblclick', () => set(44));
    splitter.addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
        event.preventDefault();
        set(event.key === 'Home' ? 44 : Number(splitter.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? -2 : 2));
    } });
}
function updateTime({ time }) {
    $('scene-time').textContent = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    if (!seekEdited && document.activeElement !== $('time-position'))
        $('time-position').value = time.toFixed(3);
    if ($('inputs-dialog').open) {
        const canvas = $('spectrum'), context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#ddd';
        inputs.fft.forEach((value, i) => context.fillRect(i * 20 + 2, 80 - value * 78, 16, value * 78 + 1));
    }
}
function renderInputs() {
    const rack = $('input-slots');
    for (let i = 0; i < 4; i++) {
        let card = rack.children[i];
        if (!card) {
            card = document.createElement('div');
            card.className = 'input-card';
            const heading = document.createElement('strong');
            heading.textContent = `s${i}`;
            const name = document.createElement('span');
            name.className = 'input-name';
            const preview = document.createElement('div');
            preview.className = 'input-preview';
            card.append(heading, preview, name);
            rack.append(card);
        }
        const slot = inputs.slots[i], preview = card.querySelector('.input-preview');
        card.querySelector('.input-name').textContent = slot ? `${slot.kind === 'camera' ? t('camera') : slot.kind === 'image' ? t('image') : t('video')}: ${slot.name}` : t('inputEmpty');
        card.classList.toggle('active', !!slot);
        if (slot && preview.firstElementChild !== slot.element) {
            slot.element.setAttribute('aria-label', `s${i}`);
            preview.replaceChildren(slot.element);
        }
        else if (!slot)
            preview.replaceChildren();
    }
    $('mic-status').textContent = t(inputs.microphone ? 'deviceOn' : 'deviceOff');
    $('mic-button').textContent = t(inputs.microphone ? 'disableMic' : 'enableMic');
    updateBadges();
    if (renderer && !renderer.running)
        renderer.render(0);
}
function installInputs() {
    const selected = () => Number($('input-slot').value);
    const perform = async (button, work) => {
        button.disabled = true;
        inputPending++;
        updateBadges();
        $('input-message').textContent = t('inputLoading');
        try {
            await work();
            $('input-message').textContent = '';
        }
        catch (error) {
            $('input-message').textContent = error.name === 'AbortError' ? '' : `${t('inputFailed')} ${error.message}`;
        }
        finally { button.disabled = false; inputPending--; updateBadges(); }
    };
    $('inputs-button').addEventListener('click', () => { renderInputs(); $('inputs-dialog').showModal(); });
    $('media-file-button').addEventListener('click', () => $('media-file').click());
    $('media-file').addEventListener('change', async (event) => {
        const file = event.target.files[0], index = selected();
        event.target.value = '';
        if (file)
            await perform($('media-file-button'), () => inputs.loadFile(index, file));
    });
    $('camera-button').addEventListener('click', () => { const index = selected(); return perform($('camera-button'), () => inputs.camera(index)); });
    $('clear-input-button').addEventListener('click', () => inputs.clear(selected()));
    $('mic-button').addEventListener('click', () => inputs.microphone ? inputs.stopMicrophone() : perform($('mic-button'), () => inputs.startMicrophone()));
    $('audio-gain').addEventListener('input', () => { inputs.gain = Number($('audio-gain').value); });
    const writeSketch = (source) => {
        if (editor.value !== templateSource && !confirm(t('replaceConfirm')))
            return;
        revision++;
        compiler.cancel();
        markBusy(false);
        editor.value = source;
        lastValidSource = source;
        updateBadges();
        saveDraft();
        $('inputs-dialog').close();
    };
    $('use-input-button').addEventListener('click', () => writeSketch(`src(s${selected()}).kaleid(4).out\n`));
    $('use-audio-button').addEventListener('click', () => writeSketch('osc(6 + audio.fft(0) * 24, 0.08, 1.4)\n  .kaleid(5)\n  .brightness(audio.level * 0.6)\n  .rotate(beat * 0.08)\n  .out\n'));
    $('time-speed').addEventListener('input', () => {
        renderer?.setSpeed(Number($('time-speed').value));
        $('time-speed-value').textContent = `${Number($('time-speed').value).toFixed(1)}×`;
    });
    $('bpm').addEventListener('change', () => { try { renderer?.setBpm(Number($('bpm').value)); } catch (error) { report(error); } });
    $('time-position').addEventListener('input', () => { seekEdited = true; });
    $('seek-button').addEventListener('click', () => { try { const seconds = Number($('time-position').value); seekEdited = false; renderer?.seek(seconds); } catch (error) { report(error); } });
    $('step-button').addEventListener('click', () => { seekEdited = false; renderer?.step(); status('pausedStatus'); updateBadges(); });
}
async function start() {
    const requested = new URL(location.href).searchParams.get('lang') ?? storage.get('language') ?? 'en';
    await i18n.load(requested);
    for (const [code, name] of Object.entries(LANGUAGES)) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        $('language').append(option);
    }
    $('language').value = i18n.language;
    $('language').setAttribute('aria-label', t('language'));
    editor = new Editor($('editor'), (source) => {
        if (encoder.encode(source).length > LIMITS.sourceBytes) {
            editor.value = lastValidSource;
            report(new Error(t('sourceTooLarge')));
            return;
        }
        lastValidSource = source;
        updateBadges();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 350);
    }, (line, column) => { $('cursor-position').textContent = t('cursor', { line, column }); });
    $('source-code').maxLength = LIMITS.sourceBytes;
    compiler = new CompilerClient({ onStatus: (stage) => status(stage), onProgress: (fraction) => { $('progress').value = Math.min(1, Math.max(0, Number(fraction) || 0)); } });
    inputs = new Inputs({ onChange: renderInputs, onError: report });
    try {
        renderer = new Renderer($('view'), {
            inputs, onFrame: updateTime,
            onStats: ({ fps, time }) => { $('fps').textContent = `${Math.round(fps)} fps`; $('scene-time').textContent = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`; },
            onError: (error) => { report(error); updateBadges(); }, onRestore: () => { status('recovered'); updateBadges(); },
        });
        const resolution = storage.get('resolution');
        if (['540', '720', '1080'].includes(resolution))
            $('resolution').value = resolution;
        changeResolution();
    }
    catch (error) {
        $('gpu-error').hidden = false;
        $('gpu-error').textContent = error.message;
        report(error);
    }
    manifest = await fetchAsset('examples/manifest.json', true);
    config = await fetchAsset('compiler-config.json', true);
    $('compiler-mode').textContent = t(config.mode === 'cdn' ? 'cdnCompiler' : 'localCompiler');
    let draft;
    try {
        draft = JSON.parse(storage.get('draft') ?? 'null');
    }
    catch { /* Corrupt storage never blocks startup. */ }
    await loadExample(manifest.find((item) => item.id === draft?.example)?.id ?? manifest[0].id);
    try {
        const shared = await readSharedSource(location.hash);
        if (shared !== null) {
            editor.value = shared;
            lastValidSource = shared;
            log(t('loadedShared'), false, true);
        }
        else if (draft?.version === 1 && typeof draft.source === 'string' && encoder.encode(draft.source).length <= LIMITS.sourceBytes) {
            editor.value = draft.source;
            lastValidSource = draft.source;
            if (draft.source !== templateSource)
                log(t('restored'), false, true);
        }
    }
    catch (error) {
        report(error);
    }
    saveDraft();
    updateBadges();
    renderGallery();
    renderAPI();
    renderInputs();
    installInputs();
    installSplitter();
    if (!renderer) {
        status('failed', {}, true);
        log($('gpu-error').textContent, true, true);
    }
    $('run-button').addEventListener('click', compile);
    $('stop-button').addEventListener('click', () => { revision++; compiler.cancel(); renderer?.pause(); inputs.stopDevices(); markBusy(false); status('cancelled'); updateBadges(); });
    $('pause-button').addEventListener('click', pauseOrResume);
    $('reset-button').addEventListener('click', () => { seekEdited = false; renderer?.reset(); });
    $('clear-console').addEventListener('click', () => { log('', false, true); $('console-badge').textContent = ''; });
    $('save-button').addEventListener('click', saveSource);
    $('open-button').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file)
            return;
        try {
            if (file.size > LIMITS.sourceBytes)
                throw new Error(t('sourceTooLarge'));
            const text = await file.text();
            revision++;
            compiler.cancel();
            markBusy(false);
            editor.value = text;
            lastValidSource = text;
            updateBadges();
            saveDraft();
            status('ready');
        }
        catch (error) {
            report(error);
        }
    });
    $('resolution').addEventListener('change', () => { try {
        changeResolution();
    }
    catch (error) {
        report(error);
    } });
    $('output-select').addEventListener('change', () => { if (renderer) {
        renderer.display = $('output-select').selectedIndex;
        if (!renderer.running)
            renderer.render(0);
    } });
    $('canvas-stage').addEventListener('pointermove', (event) => {
        const box = $('view').getBoundingClientRect();
        renderer?.setMouse((event.clientX - box.left) / box.width, 1 - (event.clientY - box.top) / box.height);
    });
    $('fullscreen-button').addEventListener('click', async () => { try {
        if (document.fullscreenElement)
            await document.exitFullscreen();
        else
            await $('canvas-stage').requestFullscreen();
    }
    catch (error) {
        report(error);
    } });
    $('snapshot-button').addEventListener('click', async () => { try {
        if (renderer) {
            download(await renderer.capture(), 'hydra-crystal.png');
            log(t('screenshotSaved'));
        }
    }
    catch (error) {
        report(error);
    } });
    $('gallery-button').addEventListener('click', () => $('gallery-dialog').showModal());
    $('api-button').addEventListener('click', () => $('api-dialog').showModal());
    $('share-button').addEventListener('click', async () => { try {
        $('share-url').value = await createShareURL(editor.value, location.href, i18n.language);
        $('copy-link').textContent = t('copy');
        $('share-dialog').showModal();
    }
    catch (error) {
        report(error);
    } });
    $('copy-link').addEventListener('click', async () => { try {
        await navigator.clipboard.writeText($('share-url').value);
        $('copy-link').textContent = t('copied');
    }
    catch {
        $('share-url').focus();
        $('share-url').select();
    } });
    $('shader-button').addEventListener('click', () => { $('shader-code').textContent = renderer?.shader ?? ''; $('shader-dialog').showModal(); });
    $('export-shader').addEventListener('click', () => download(new Blob([renderer?.shader ?? ''], { type: 'text/plain' }), 'sketch.frag'));
    $('export-graph').addEventListener('click', () => download(new Blob([JSON.stringify(renderer?.graph, null, 2)], { type: 'application/json' }), 'graph.json'));
    for (const button of document.querySelectorAll('.close-dialog'))
        button.addEventListener('click', () => button.closest('dialog').close());
    for (const dialog of document.querySelectorAll('dialog'))
        dialog.addEventListener('click', (event) => { if (event.target !== dialog)
            return; const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
            dialog.close(); });
    $('language').addEventListener('change', async () => {
        try {
            await i18n.load($('language').value);
            $('language').value = i18n.language;
            const url = new URL(location.href);
            url.searchParams.set('lang', i18n.language);
            history.replaceState(null, '', url);
            $('language').setAttribute('aria-label', t('language'));
            $('compiler-mode').textContent = t(config.mode === 'cdn' ? 'cdnCompiler' : 'localCompiler');
            refreshGraphUI();
            renderGallery();
            renderAPI();
            renderInputs();
            editor.position();
            status(statusKey, statusValues);
        }
        catch (error) {
            report(error);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.isComposing || !(event.ctrlKey || event.metaKey))
            return;
        if (event.key === 'Enter' && !document.querySelector('dialog[open]')) {
            event.preventDefault();
            compile();
        }
        if (event.key.toLowerCase() === 's') {
            event.preventDefault();
            saveSource();
        }
    });
    window.addEventListener('pagehide', () => { saveDraft(); compiler.dispose(); renderer?.dispose(); inputs.dispose(); });
    window.addEventListener('hashchange', async () => { try {
        const source = await readSharedSource(location.hash);
        if (source !== null) {
            revision++;
            compiler.cancel();
            markBusy(false);
            editor.value = source;
            lastValidSource = source;
            updateBadges();
            saveDraft();
            log(t('loadedShared'));
        }
    }
    catch (error) {
        report(error);
    } });
    document.body.dataset.ready = 'true';
    // Opt-in diagnostics for the browser regression suite, not code evaluation.
    if (new URL(location.href).searchParams.get('test') === '1')
        globalThis.__hydraTest = { renderer, editor, compiler, inputs, loadExample, compile };
}
start().catch((error) => { console.error(error); log(error.message, true, true); $('status-text').textContent = error.message; document.body.dataset.failed = 'true'; });
window.addEventListener("pageshow", (event) => { if (event.persisted)
    location.reload(); });
