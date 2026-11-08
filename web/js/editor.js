export function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Lightweight display highlighter, never used to evaluate or compile source. */
export function highlightCrystal(source) {
    const tokens = /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|end|do|if|else|elsif|unless|while|until|for|in|class|module|struct|return|require|include|true|false|nil|begin|rescue|ensure|case|when|yield)\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Z]\w*\b|\b[a-z_]\w*(?=\s*\()|(?<=\.)[a-z_]\w*/g;
    let html = '', last = 0;
    for (const match of source.matchAll(tokens)) {
        html += escapeHTML(source.slice(last, match.index));
        const value = match[0];
        const style = value.startsWith('#') ? 'comment' : /^["']/.test(value) ? 'string' : /^\d/.test(value) ? 'number'
            : /^[A-Z]/.test(value) ? 'constant' : /^(def|end|do|if|else|elsif|unless|while|until|for|in|class|module|struct|return|require|include|true|false|nil|begin|rescue|ensure|case|when|yield)$/.test(value) ? 'keyword' : 'function';
        html += `<span class="tok-${style}">${escapeHTML(value)}</span>`;
        last = match.index + value.length;
    }
    return html + escapeHTML(source.slice(last)) + '\n';
}
export class Editor {
    constructor(container, onChange = () => { }, onPosition = () => { }) {
        this.container = container;
        this.input = container.querySelector('textarea');
        this.paint = container.querySelector('.editor-paint');
        this.gutter = container.querySelector('.editor-lines');
        this.onChange = onChange;
        this.onPosition = onPosition;
        this.errorLine = 0;
        this.input.addEventListener('input', () => { this.errorLine = 0; this.refresh(); onChange(this.value); });
        this.input.addEventListener('scroll', () => this.syncScroll());
        this.input.addEventListener('click', () => this.position());
        this.input.addEventListener('keyup', () => this.position());
        this.input.addEventListener('keydown', (event) => this.key(event));
        this.refresh();
    }
    get value() { return this.input.value; }
    set value(text) { this.input.value = text; this.errorLine = 0; this.input.scrollTop = 0; this.input.scrollLeft = 0; this.refresh(); }
    refresh() {
        this.paint.innerHTML = highlightCrystal(this.value);
        const count = this.value.split('\n').length;
        this.gutter.replaceChildren(...Array.from({ length: count }, (_, i) => {
            const line = document.createElement('div');
            line.textContent = i + 1;
            if (i + 1 === this.errorLine)
                line.className = 'error-line';
            return line;
        }));
        this.syncScroll();
        this.position();
    }
    syncScroll() {
        this.paint.style.transform = `translate(${-this.input.scrollLeft}px, ${-this.input.scrollTop}px)`;
        this.gutter.style.transform = `translateY(${-this.input.scrollTop}px)`;
    }
    position() {
        const preceding = this.value.slice(0, this.input.selectionStart).split('\n');
        this.onPosition(preceding.length, preceding.at(-1).length + 1);
    }
    insert(text, start = this.input.selectionStart, end = this.input.selectionEnd) {
        this.input.setRangeText(text, start, end, 'end');
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    key(event) {
        if (event.isComposing)
            return;
        if (event.key === 'Tab') {
            event.preventDefault();
            const start = this.input.selectionStart, end = this.input.selectionEnd;
            if (start === end && !event.shiftKey) {
                this.insert('  ');
                return;
            }
            const first = this.value.lastIndexOf('\n', start - 1) + 1;
            const range = this.value.slice(first, end);
            const text = range.split('\n').map((line) => event.shiftKey ? line.replace(/^ {1,2}/, '') : `  ${line}`).join('\n');
            this.insert(text, first, end);
            this.input.setSelectionRange(first, first + text.length);
        }
        else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const line = this.value.slice(0, this.input.selectionStart).split('\n').at(-1);
            const spaces = /^ */.exec(line)[0];
            const more = /\b(do|def|class|module|struct|if|unless|while|begin|case)\b/.test(line) && !/\bend\s*$/.test(line) ? '  ' : '';
            this.insert(`\n${spaces}${more}`);
        }
        else if ((event.ctrlKey || event.metaKey) && event.key === '/') {
            event.preventDefault();
            const start = this.value.lastIndexOf('\n', this.input.selectionStart - 1) + 1;
            let end = this.value.indexOf('\n', this.input.selectionEnd);
            if (end === -1)
                end = this.value.length;
            const lines = this.value.slice(start, end).split('\n');
            const uncomment = lines.every((line) => /^\s*#/.test(line) || line.trim() === '');
            const text = lines.map((line) => uncomment ? line.replace(/^(\s*)# ?/, '$1') : `# ${line}`).join('\n');
            this.insert(text, start, end);
            this.input.setSelectionRange(start, start + text.length);
        }
    }
    markError(text) {
        const match = /sketch\.cr:(\d+)(?::(\d+))?/.exec(text);
        this.errorLine = match ? Number(match[1]) : 0;
        this.refresh();
    }
}
