export const FFT_BANDS = 32;

/** Logarithmic bands from 20 Hz to Nyquist, normalized to 0…1. */
export function spectrumBands(bytes, sampleRate, fftSize, target = new Float32Array(FFT_BANDS)) {
    const upper = sampleRate / 2;
    for (let band = 0; band < target.length; band++) {
        const low = 20 * (upper / 20) ** (band / target.length);
        const high = 20 * (upper / 20) ** ((band + 1) / target.length);
        const start = Math.min(bytes.length - 1, Math.max(1, Math.floor(low * fftSize / sampleRate)));
        const end = Math.min(bytes.length, Math.max(start + 1, Math.ceil(high * fftSize / sampleRate)));
        let sum = 0;
        for (let i = start; i < end; i++)
            sum += (bytes[i] / 255) ** 2;
        target[band] = Math.sqrt(sum / (end - start));
    }
    return target;
}

/** Owns user-selected files and explicitly enabled devices; never persists them. */
export class Inputs {
    constructor({ onChange = () => {}, onError = () => {} } = {}) {
        this.slots = Array.from({ length: 4 }, () => null);
        this.revisions = [0, 0, 0, 0];
        this.pendingSlots = [null, null, null, null];
        this.onChange = onChange;
        this.onError = onError;
        this.fft = new Float32Array(FFT_BANDS);
        this.level = 0;
        this.gain = 1;
        this.microphone = null;
        this.audioContext = null;
        this.micRevision = 0;
        this.disposed = false;
        this.transport = { time: 0, speed: 1, running: false };
    }
    _index(index) {
        if (!Number.isInteger(index) || index < 0 || index > 3)
            throw new Error('Input slot must be 0–3.');
    }
    _release(slot) {
        if (!slot)
            return;
        slot.controller?.abort();
        slot.stream?.getTracks().forEach(track => track.stop());
        if (slot.kind !== 'image') {
            slot.element.pause();
            slot.element.srcObject = null;
            slot.element.removeAttribute('src');
            slot.element.load();
        }
        slot.element.remove();
        if (slot.url)
            URL.revokeObjectURL(slot.url);
    }
    clear(index) {
        this._index(index);
        this.revisions[index]++;
        this._release(this.pendingSlots[index]);
        this.pendingSlots[index] = null;
        this._release(this.slots[index]);
        this.slots[index] = null;
        this.onChange();
    }
    _commit(index, revision, slot) {
        if (this.pendingSlots[index] === slot)
            this.pendingSlots[index] = null;
        if (this.disposed || this.revisions[index] !== revision) {
            this._release(slot);
            return false;
        }
        this._release(this.slots[index]);
        this.slots[index] = slot;
        this.onChange();
        this.sync(this.transport, true);
        return true;
    }
    _loaded(element, event, begin, signal) {
        return new Promise((resolve, reject) => {
            const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, ready); element.removeEventListener('error', failed); signal?.removeEventListener('abort', cancelled); };
            const ready = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error('Cannot decode this media file. Try a format supported by your browser.')); };
            const cancelled = () => { cleanup(); reject(new DOMException('Input cancelled.', 'AbortError')); };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Media loading timed out.')); }, 30000);
            element.addEventListener(event, ready);
            element.addEventListener('error', failed);
            signal?.addEventListener('abort', cancelled, { once: true });
            if (signal?.aborted) { cancelled(); return; }
            begin();
        });
    }
    async loadFile(index, file) {
        this._index(index);
        const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
        if (!kind)
            throw new Error('Select an image or video file.');
        const revision = ++this.revisions[index];
        this._release(this.pendingSlots[index]);
        const element = document.createElement(kind === 'image' ? 'img' : 'video');
        const slot = { kind, name: file.name, element, url: URL.createObjectURL(file), controller: new AbortController() };
        this.pendingSlots[index] = slot;
        if (kind === 'video') {
            element.muted = true;
            element.loop = true;
            element.playsInline = true;
            element.preload = 'auto';
        }
        try {
            await this._loaded(element, kind === 'image' ? 'load' : 'loadeddata', () => { element.src = slot.url; }, slot.controller.signal);
            if (kind === 'video')
                element.addEventListener('seeked', () => { if (this.slots[index] === slot) this.onChange(); });
            this._commit(index, revision, slot);
        }
        catch (error) {
            if (this.pendingSlots[index] === slot)
                this.pendingSlots[index] = null;
            this._release(slot);
            throw error;
        }
    }
    async camera(index) {
        this._index(index);
        if (!navigator.mediaDevices?.getUserMedia)
            throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
        const revision = ++this.revisions[index];
        this._release(this.pendingSlots[index]);
        this.pendingSlots[index] = null;
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (this.disposed || revision !== this.revisions[index]) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        const element = document.createElement('video');
        element.muted = true;
        element.playsInline = true;
        const slot = { kind: 'camera', name: stream.getVideoTracks()[0]?.label || 'Camera', element, stream, controller: new AbortController() };
        this.pendingSlots[index] = slot;
        try {
            await this._loaded(element, 'loadeddata', () => { element.srcObject = stream; element.play().catch(error => { if (error.name !== 'AbortError') this.onError(error); }); }, slot.controller.signal);
            if (this._commit(index, revision, slot)) {
                for (const track of stream.getVideoTracks())
                    track.addEventListener('ended', () => { if (this.slots[index] === slot) this.clear(index); });
            }
        }
        catch (error) {
            if (this.pendingSlots[index] === slot)
                this.pendingSlots[index] = null;
            this._release(slot);
            throw error;
        }
    }
    async startMicrophone() {
        if (!navigator.mediaDevices?.getUserMedia)
            throw new Error('Microphone access requires HTTPS or localhost and a supported browser.');
        const revision = ++this.micRevision;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
        if (this.disposed || revision !== this.micRevision) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        let context;
        let pending;
        try {
            context = new AudioContext();
            this._releasePendingMicrophone();
            pending = this.pendingMic = { stream, context };
            await context.resume();
            if (this.disposed || revision !== this.micRevision) {
                stream.getTracks().forEach(track => track.stop());
                if (context.state !== 'closed') await context.close();
                return;
            }
            const source = context.createMediaStreamSource(stream);
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.7;
            source.connect(analyser); // Intentionally no connection to speakers.
            this.pendingMic = null;
            this._releaseMicrophone();
            this.microphone = stream;
            this.audioContext = context;
            this.audioSource = source;
            this.analyser = analyser;
            this.frequencies = new Uint8Array(analyser.frequencyBinCount);
            this.waveform = new Float32Array(analyser.fftSize);
            for (const track of stream.getAudioTracks())
                track.addEventListener('ended', () => { if (this.microphone === stream) this.stopMicrophone(); });
            this.onChange();
        }
        catch (error) {
            if (this.pendingMic === pending)
                this.pendingMic = null;
            stream.getTracks().forEach(track => track.stop());
            if (context && context.state !== 'closed') await context.close();
            if (this.disposed || revision !== this.micRevision)
                throw new DOMException('Input cancelled.', 'AbortError');
            throw error;
        }
    }
    _releasePendingMicrophone() {
        this.pendingMic?.stream.getTracks().forEach(track => track.stop());
        if (this.pendingMic && this.pendingMic.context.state !== 'closed')
            this.pendingMic.context.close().catch(this.onError);
        this.pendingMic = null;
    }
    _releaseMicrophone() {
        this.microphone?.getTracks().forEach(track => track.stop());
        this.audioSource?.disconnect();
        this.analyser?.disconnect();
        this.audioContext?.close().catch(this.onError);
        this.microphone = this.audioContext = this.audioSource = this.analyser = null;
        this.fft.fill(0);
        this.level = 0;
    }
    stopMicrophone() { this.micRevision++; this._releasePendingMicrophone(); this._releaseMicrophone(); this.onChange(); }
    sample() {
        if (!this.analyser)
            return;
        this.analyser.getByteFrequencyData(this.frequencies);
        spectrumBands(this.frequencies, this.audioContext.sampleRate, this.analyser.fftSize, this.fft);
        this.analyser.getFloatTimeDomainData(this.waveform);
        let sum = 0;
        for (const value of this.waveform)
            sum += value * value;
        this.level = Math.min(1, Math.sqrt(sum / this.waveform.length) * this.gain);
        for (let i = 0; i < this.fft.length; i++)
            this.fft[i] = Math.min(1, this.fft[i] * this.gain);
    }
    sync(transport, seek = false) {
        this.transport = { ...transport };
        for (const slot of this.slots) {
            if (slot?.kind !== 'video')
                continue;
            const video = slot.element;
            if (Number.isFinite(video.duration) && video.duration > 0) {
                const target = transport.time % video.duration;
                if (seek || Math.abs(video.currentTime - target) > 0.3)
                    video.currentTime = target;
            }
            if (transport.running && transport.speed > 0) {
                video.playbackRate = Math.max(0.0625, transport.speed);
                if (video.paused)
                    video.play().catch(error => { if (error.name !== 'AbortError') this.onError(error); });
            }
            else
                video.pause();
        }
    }
    source(index) {
        const slot = this.slots[index];
        if (!slot)
            return null;
        const element = slot.element;
        if (slot.kind === 'image' ? !element.complete || !element.naturalWidth : element.readyState < 2)
            return null;
        return element;
    }
    stopDevices() {
        // Invalidate in-flight permission requests as well as active devices.
        for (let i = 0; i < 4; i++) {
            this.revisions[i]++;
            this._release(this.pendingSlots[i]);
            this.pendingSlots[i] = null;
            if (this.slots[i]?.kind === 'camera')
                this.clear(i);
        }
        this.stopMicrophone();
    }
    dispose() {
        this.disposed = true;
        this.onChange = () => {};
        this.onError = () => {};
        this.stopDevices();
        for (let i = 0; i < 4; i++)
            this.clear(i);
    }
}
