export const LANGUAGES = Object.freeze({ en: 'English', ja: '日本語', 'zh-CN': '简体中文', ko: '한국어', es: 'Español', fr: 'Français', de: 'Deutsch', 'pt-BR': 'Português', ru: 'Русский' });
export const storage = {
    get(key) { try {
        // Preserve drafts and preferences saved before the project was renamed.
        return localStorage.getItem(`plankton:${key}`) ?? localStorage.getItem(`hydra-crystal:${key}`);
    }
    catch {
        return null;
    } },
    set(key, value) { try {
        localStorage.setItem(`plankton:${key}`, value);
    }
    catch { /* Private browsing/quota: editing still works. */ } },
};
export class I18n {
    constructor() { this.language = 'en'; this.messages = {}; this.english = {}; this.serial = 0; }
    t(key, values = {}) {
        const text = this.messages[key] ?? this.english[key] ?? key;
        return text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
    }
    async load(language) {
        if (!Object.hasOwn(LANGUAGES, language))
            language = 'en';
        const serial = ++this.serial;
        const read = async (code) => {
            const response = await fetch(new URL(`../locales/${code}.json`, import.meta.url));
            if (!response.ok)
                throw new Error(`Cannot load language ${code}.`);
            return response.json();
        };
        if (!Object.keys(this.english).length)
            this.english = await read('en');
        const messages = language === 'en' ? this.english : await read(language);
        if (serial !== this.serial)
            return;
        this.messages = messages;
        this.language = language;
        document.documentElement.lang = language;
        storage.set('language', language);
        this.apply();
    }
    apply(root = document) {
        for (const el of root.querySelectorAll('[data-i18n]'))
            el.textContent = this.t(el.dataset.i18n);
        for (const el of root.querySelectorAll('[data-i18n-title]'))
            el.title = this.t(el.dataset.i18nTitle);
        for (const el of root.querySelectorAll('[data-i18n-aria]'))
            el.setAttribute('aria-label', this.t(el.dataset.i18nAria));
    }
}
