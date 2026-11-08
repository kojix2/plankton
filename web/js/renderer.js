import { validateGraph } from './graph.js';
import { VERTEX_SHADER, COPY_SHADER, createFragmentShader } from './shader.js';
function compileProgram(gl, fragment) {
    const shaders = [];
    let program;
    try {
        for (const [type, text] of [[gl.VERTEX_SHADER, VERTEX_SHADER], [gl.FRAGMENT_SHADER, fragment]]) {
            const shader = gl.createShader(type);
            if (!shader)
                throw new Error('WebGL could not allocate a shader.');
            shaders.push(shader);
            gl.shaderSource(shader, text);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                throw new Error((gl.getShaderInfoLog(shader) || 'Shader compilation failed.').slice(0, 12000));
        }
        program = gl.createProgram();
        if (!program)
            throw new Error('WebGL could not allocate a program.');
        shaders.forEach((shader) => gl.attachShader(program, shader));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error((gl.getProgramInfoLog(program) || 'Shader linking failed.').slice(0, 12000));
        return program;
    }
    catch (error) {
        if (program)
            gl.deleteProgram(program);
        throw error;
    }
    finally {
        shaders.forEach((shader) => gl.deleteShader(shader));
    }
}
/** Four double-buffered outputs. ALL src(oN) references read the previous frame.
 * No output ever samples its currently attached render target. */
export class Renderer {
    constructor(canvas, { inputs = null, onFrame = () => {}, onStats = () => { }, onError = () => { }, onRestore = () => { } } = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
        if (!this.gl)
            throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or use another browser.');
        this.onStats = onStats;
        this.onError = onError;
        this.onRestore = onRestore;
        this.inputs = inputs;
        this.onFrame = onFrame;
        this.bpm = 120;
        this.delta = 0;
        this.graph = null;
        this.shader = '';
        this.program = null;
        this.buffers = [];
        this.parameters = new Map();
        this.mouse = [0.5, 0.5];
        this.time = 0;
        this.frames = 0;
        this.speed = 1;
        this.display = 0;
        this.readIndex = 0;
        this.silentSpectrum = new Float32Array(32);
        this.running = false;
        this.lost = false;
        this.width = 0;
        this.height = 0;
        this._raf = 0;
        this._initialize();
        this._lost = (event) => {
            event.preventDefault();
            this._wasRunning = this.running;
            this.pause();
            this.lost = true;
            this.onError(new Error('WebGL context lost. Waiting for the browser to restore it.'));
        };
        this._restored = () => {
            try {
                this.lost = false;
                const graph = this.graph;
                const width = this.width, height = this.height;
                this.buffers = [];
                this.program = null;
                this.width = 0;
                this.height = 0;
                this._initialize();
                this.resize(width, height);
                if (graph)
                    this.setGraph(graph, { clear: true });
                if (this._wasRunning)
                    this.resume();
                this.onRestore();
            }
            catch (error) {
                this.onError(error);
            }
        };
        canvas.addEventListener('webglcontextlost', this._lost);
        canvas.addEventListener('webglcontextrestored', this._restored);
    }
    _initialize() {
        const gl = this.gl;
        this.copyProgram = compileProgram(gl, COPY_SHADER);
        this.copyLocation = gl.getUniformLocation(this.copyProgram, 'u_texture');
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        this.readIndex = 0;
        this.inputTextures = Array.from({ length: 4 }, () => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
            return texture;
        });
        this.inputSources = [null, null, null, null];
        this.inputStaging = document.createElement('canvas');
    }
    _target(width, height) {
        const gl = this.gl;
        const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
        try {
            if (!texture || !framebuffer)
                throw new Error('Unable to allocate GPU buffers.');
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                throw new Error('GPU framebuffer allocation failed. Try a lower resolution.');
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return { texture, framebuffer };
        }
        catch (error) {
            gl.deleteTexture(texture);
            gl.deleteFramebuffer(framebuffer);
            throw error;
        }
    }
    _deleteTargets(buffers) {
        for (const pair of buffers)
            for (const target of pair) {
                this.gl.deleteTexture(target.texture);
                this.gl.deleteFramebuffer(target.framebuffer);
            }
    }
    resize(width, height) {
        if (this.lost)
            return;
        const max = Math.min(1920, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > max || height > Math.min(1080, max))
            throw new Error('Resolution must fit within 1920 × 1080.');
        if (width === this.width && height === this.height)
            return;
        const next = [];
        try {
            for (let i = 0; i < 4; i++) {
                const pair = [];
                next.push(pair);
                pair.push(this._target(width, height));
                pair.push(this._target(width, height));
            }
        }
        catch (error) {
            this._deleteTargets(next);
            throw error;
        }
        this._deleteTargets(this.buffers);
        this.buffers = next;
        this.width = this.canvas.width = width;
        this.height = this.canvas.height = height;
        this.readIndex = 0;
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        if (this.graph)
            this.render(0);
    }
    setGraph(input, { clear = false, preserveParameters = true } = {}) {
        if (this.lost)
            throw new Error('WebGL context is currently lost.');
        const graph = validateGraph(input);
        const source = createFragmentShader(graph);
        const program = compileProgram(this.gl, source); // transactional: old graph still exists on failure
        const names = ['u_time', 'u_frame', 'u_delta', 'u_bpm', 'u_audio_level', 'u_fft[0]', 'u_mouse', 'u_resolution', 'u_output', 'u_o0', 'u_o1', 'u_o2', 'u_o3', 'u_s0', 'u_s1', 'u_s2', 'u_s3', ...graph.params.map((_, i) => `u_p${i}`)];
        const locations = Object.fromEntries(names.map((name) => [name, this.gl.getUniformLocation(program, name)]));
        const nextParameters = new Map(graph.params.map((p) => [p.key, Math.min(p.max, Math.max(p.min, (preserveParameters ? this.parameters.get(p.key) : undefined) ?? p.value))]));
        if (this.program)
            this.gl.deleteProgram(this.program);
        this.program = program;
        this.locations = locations;
        this.shader = source;
        this.graph = graph;
        this.parameters = nextParameters;
        this.display = graph.display;
        if (clear)
            this.reset();
        else {
            graph.outputs.forEach((id, i) => { if (id === null)
                this._clearOutput(i); });
            this.render(0);
        }
    }
    _clearOutput(index) {
        const gl = this.gl;
        for (const target of this.buffers[index] ?? []) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    reset() {
        this.time = 0;
        this.frames = 0;
        this.inputs?.sync({ time: this.time, speed: this.speed, running: this.running }, true);
        for (let i = 0; i < 4; i++)
            this._clearOutput(i);
        if (this.graph)
            this.render(0);
    }
    setParameter(key, value) {
        const spec = this.graph?.params.find((p) => p.key === key);
        if (!spec || !Number.isFinite(value))
            return;
        this.parameters.set(key, Math.max(spec.min, Math.min(spec.max, value)));
        if (!this.running)
            this.render(0);
    }
    setMouse(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return;
        this.mouse[0] = Math.min(1, Math.max(0, x));
        this.mouse[1] = Math.min(1, Math.max(0, y));
        if (!this.running && !this.lost)
            this.render(0);
    }
    setSpeed(value) {
        if (!Number.isFinite(value) || value < 0 || value > 4)
            throw new Error('Speed must be between 0 and 4.');
        this.speed = value;
        this.inputs?.sync({ time: this.time, speed: this.speed, running: this.running });
    }
    setBpm(value) {
        if (!Number.isFinite(value) || value < 20 || value > 300)
            throw new Error('BPM must be between 20 and 300.');
        this.bpm = value;
        if (!this.running)
            this.render(0);
    }
    seek(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)
            throw new Error('Time must be between 0 and 86400 seconds.');
        this.time = seconds;
        // A seek is a discontinuity: old feedback frames are not historical state.
        for (let i = 0; i < 4; i++)
            this._clearOutput(i);
        this.inputs?.sync({ time: this.time, speed: this.speed, running: this.running }, true);
        this.render(0);
    }
    step() {
        this.pause();
        this.render(1 / 60, 1);
        this.inputs?.sync({ time: this.time, speed: this.speed, running: false }, true);
    }
    _uploadInputs() {
        const gl = this.gl;
        for (let i = 0; i < 4; i++) {
            const source = this.inputs?.source(i) ?? null;
            gl.activeTexture(gl.TEXTURE0 + 4 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.inputTextures[i]);
            gl.uniform1i(this.locations[`u_s${i}`], 4 + i);
            if (source) {
                if (source === this.inputSources[i] && source.tagName === 'IMG')
                    continue;
                const width = source.videoWidth || source.naturalWidth;
                const height = source.videoHeight || source.naturalHeight;
                const max = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
                let pixels = source;
                if (width > max || height > max) {
                    const scale = Math.min(max / width, max / height);
                    this.inputStaging.width = Math.max(1, Math.floor(width * scale));
                    this.inputStaging.height = Math.max(1, Math.floor(height * scale));
                    this.inputStaging.getContext('2d').drawImage(source, 0, 0, this.inputStaging.width, this.inputStaging.height);
                    pixels = this.inputStaging;
                }
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            }
            else if (this.inputSources[i])
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
            this.inputSources[i] = source;
        }
    }
    render(deltaSeconds = 0, speed = this.speed) {
        if (!this.graph || !this.program || this.lost || !this.buffers.length)
            return;
        const gl = this.gl, u = this.locations;
        this.delta = Math.max(0, Math.min(0.1, deltaSeconds)) * speed;
        this.time = Math.min(86400, this.time + this.delta);
        this.inputs?.sync({ time: this.time, speed: this.speed, running: this.running });
        this.inputs?.sample();
        gl.bindVertexArray(this.vao);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.program);
        gl.uniform1f(u.u_time, this.time);
        gl.uniform1f(u.u_frame, this.frames);
        gl.uniform1f(u.u_delta, this.delta);
        gl.uniform1f(u.u_bpm, this.bpm);
        gl.uniform1f(u.u_audio_level, this.inputs?.level ?? 0);
        gl.uniform1fv(u['u_fft[0]'], this.inputs?.fft ?? this.silentSpectrum);
        gl.uniform2f(u.u_mouse, this.mouse[0], this.mouse[1]);
        gl.uniform2f(u.u_resolution, this.width, this.height);
        this.graph.params.forEach((p, i) => gl.uniform1f(u[`u_p${i}`], this.parameters.get(p.key)));
        this._uploadInputs();
        for (let i = 0; i < 4; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.buffers[i][this.readIndex].texture);
            gl.uniform1i(u[`u_o${i}`], i);
        }
        const writeIndex = 1 - this.readIndex;
        for (let i = 0; i < 4; i++) {
            if (this.graph.outputs[i] === null)
                continue;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[i][writeIndex].framebuffer);
            gl.uniform1i(u.u_output, i);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        this.readIndex = writeIndex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.copyProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.buffers[this.display][this.readIndex].texture);
        gl.uniform1i(this.copyLocation, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.frames++;
        this.onFrame({ time: this.time, frames: this.frames });
    }
    resume() {
        if (this.running || this.lost)
            return;
        this.running = true;
        this.inputs?.sync({ time: this.time, speed: this.speed, running: true });
        let last = performance.now(), reportAt = last, count = 0;
        const tick = (now) => {
            if (!this.running)
                return;
            try {
                this.render((now - last) / 1000);
            }
            catch (error) {
                this.pause();
                this.onError(error);
                return;
            }
            last = now;
            count++;
            if (now - reportAt >= 500) {
                this.onStats({ fps: count * 1000 / (now - reportAt), time: this.time, frames: this.frames });
                reportAt = now;
                count = 0;
            }
            this._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
    }
    pause() {
        this.running = false;
        cancelAnimationFrame(this._raf);
        this._raf = 0;
        this.inputs?.sync({ time: this.time, speed: this.speed, running: false });
    }
    capture() {
        return new Promise((resolve, reject) => this.canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image capture failed.')), 'image/png'));
    }
    dispose() {
        this.pause();
        this.canvas.removeEventListener('webglcontextlost', this._lost);
        this.canvas.removeEventListener('webglcontextrestored', this._restored);
        if (!this.lost) {
            this._deleteTargets(this.buffers);
            this.gl.deleteProgram(this.program);
            this.gl.deleteProgram(this.copyProgram);
            this.gl.deleteVertexArray(this.vao);
            this.inputTextures.forEach(texture => this.gl.deleteTexture(texture));
        }
    }
}
