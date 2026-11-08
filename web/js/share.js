import { LIMITS } from './graph.js';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_URL = 16384;
function base64(bytes) {
    let binary = '';
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytes(value) {
    if (!/^[A-Za-z0-9_-]*$/.test(value))
        throw new Error('Invalid share encoding.');
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function bounded(stream) {
    const reader = stream.getReader(), chunks = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > LIMITS.sourceBytes)
                throw new Error('Shared source exceeds 64 KiB.');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}
export async function createShareURL(source, href, language) {
    const data = encoder.encode(source);
    if (data.length > LIMITS.sourceBytes)
        throw new Error('Source exceeds 64 KiB.');
    let fragment = `s=${base64(data)}`;
    if (typeof CompressionStream !== 'undefined') {
        const compressed = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
        const shorter = `z=${base64(compressed)}`;
        if (shorter.length < fragment.length)
            fragment = shorter;
    }
    const url = new URL(href);
    url.search = '';
    url.searchParams.set('lang', language);
    url.hash = fragment;
    if (url.href.length > MAX_URL)
        throw new Error('Share URL exceeds 16 KiB. Save a .cr file instead.');
    return url.href;
}
export async function readSharedSource(hash) {
    if (!hash || hash === '#')
        return null;
    if (hash.length > MAX_URL)
        throw new Error('Shared URL exceeds 16 KiB.');
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (params.has('s') && params.has('z'))
        throw new Error('Choose one share encoding.');
    if (params.has('s')) {
        const data = bytes(params.get('s'));
        if (data.length > LIMITS.sourceBytes)
            throw new Error('Shared source exceeds 64 KiB.');
        return decoder.decode(data);
    }
    if (params.has('z')) {
        if (typeof DecompressionStream === 'undefined')
            throw new Error('This browser cannot decompress shared code.');
        return decoder.decode(await bounded(new Blob([bytes(params.get('z'))]).stream().pipeThrough(new DecompressionStream('gzip'))));
    }
    return null;
}
