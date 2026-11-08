import { LIMITS } from './graph.js';
/** A separate Worker keeps compilation AND user execution off the UI thread.
 * Terminating this worker is also how infinite Crystal loops are interrupted. */
export class CompilerClient {
    constructor({ onStatus = () => { }, onProgress = () => { }, timeout = 180000 } = {}) {
        this.onStatus = onStatus;
        this.onProgress = onProgress;
        this.timeout = timeout;
        this.worker = null;
        this.pending = null;
        this.serial = 0;
    }
    _worker() {
        if (this.worker)
            return this.worker;
        const worker = new Worker(new URL('./compiler-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            if (worker !== this.worker || !this.pending || data.id !== this.pending.id)
                return;
            if (data.type === 'status')
                this.onStatus(data.stage, data.detail);
            else if (data.type === 'progress')
                this.onProgress(data.fraction);
            else if (data.type === 'result' || data.type === 'error') {
                const pending = this.pending;
                this.pending = null;
                clearTimeout(pending.timer);
                if (data.type === 'result')
                    pending.resolve(data);
                else
                    pending.reject(new Error(data.message));
            }
        };
        worker.onerror = (event) => {
            event.preventDefault();
            if (worker !== this.worker)
                return;
            this.cancel(new Error(event.message || 'The compiler worker failed.'));
        };
        worker.onmessageerror = () => { if (worker === this.worker)
            this.cancel(new Error('Unable to receive the compiler result.')); };
        this.worker = worker;
        return worker;
    }
    run(source) {
        if (typeof source !== 'string' || new TextEncoder().encode(source).length > LIMITS.sourceBytes)
            return Promise.reject(new Error('Source exceeds 64 KiB.'));
        if (this.pending)
            this.cancel();
        const id = ++this.serial;
        return new Promise((resolve, reject) => {
            this.pending = { id, resolve, reject,
                timer: setTimeout(() => this.cancel(new Error(`Compilation or execution exceeded ${Math.round(this.timeout / 1000)} seconds. Simplify the sketch and retry.`)), this.timeout) };
            try {
                this._worker().postMessage({ type: 'compile', id, source });
            }
            catch (error) {
                this.cancel(error);
            }
        });
    }
    cancel(error = new DOMException('Compilation cancelled.', 'AbortError')) {
        this.worker?.terminate();
        this.worker = null;
        const pending = this.pending;
        this.pending = null;
        if (pending) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
    }
    dispose() { this.cancel(); }
}
