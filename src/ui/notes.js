/**
 * ScriptForge Notes Library (`src/ui/notes.js`)
 * Loads public and private note indexes, applies frontmatter to the studio controls,
 * strips frontmatter before rendering, and live-reloads agent-written notes.
 */

import { splitFrontmatter, SUPPORTED_FONTS, SUPPORTED_INKS, SUPPORTED_PAPERS } from '../../shared/note-format.mjs';
import { setInk, scheduleRender } from './controls.js';
import { setHandSeed } from '../core/state.js';

const PUBLIC_INDEX = '/notes/index.json';
const PRIVATE_INDEX = '/notes/private/index.json';
const POLL_INTERVAL_MS = 4000;

let entries = [];
let currentNote = null;
let lastLoadedText = '';
let lastLoadedBody = '';
let pollTimer = null;
let loading = false;

function notePath(id) {
    return '/notes/' + String(id).split('/').map(encodeURIComponent).join('/') + '.md';
}

async function fetchIndex(url) {
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data?.notes) ? data.notes : [];
    } catch {
        return [];
    }
}

function setStatus(message, tone = 'muted') {
    const el = document.getElementById('notesStatus');
    if (!el) return;
    if (!message) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.classList.remove('hidden');
    el.textContent = message;
    el.classList.toggle('text-emerald-300', tone === 'ok');
    el.classList.toggle('text-rose-300', tone === 'error');
    el.classList.toggle('text-slate-400', tone === 'muted');
}

function optionLabel(entry) {
    const prefix = entry.scope === 'private' ? '[Private] ' : '';
    return `${prefix}${entry.title || entry.id}`;
}

function populateSelect() {
    const select = document.getElementById('notesSelect');
    if (!select) return;

    const previous = select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = entries.length ? 'Open a note…' : 'No notes yet';
    select.appendChild(placeholder);

    for (const entry of entries) {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = optionLabel(entry);
        option.dataset.scope = entry.scope || (entry.id.startsWith('private/') ? 'private' : 'public');
        select.appendChild(option);
    }

    if (previous && entries.some(e => e.id === previous)) {
        select.value = previous;
    }
}

function applyMeta(meta = {}) {
    if (meta.font && SUPPORTED_FONTS.includes(meta.font)) {
        const el = document.getElementById('fontArchetype');
        if (el) {
            el.value = meta.font;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    if (meta.paper && SUPPORTED_PAPERS.includes(meta.paper)) {
        const el = document.getElementById('paperStyle');
        if (el) {
            el.value = meta.paper;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    if (meta.ink && SUPPORTED_INKS.includes(meta.ink)) {
        setInk(meta.ink);
    }

    if (meta.seed !== undefined && meta.seed !== null && meta.seed !== '' && Number.isFinite(Number(meta.seed))) {
        setHandSeed(Number(meta.seed));
    }
}

function markSelected(id) {
    const select = document.getElementById('notesSelect');
    if (!select) return;
    if (!Array.from(select.options).some(option => option.value === id)) {
        const entry = entries.find(e => e.id === id);
        if (entry) {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = optionLabel(entry);
            select.appendChild(option);
        }
    }
    if (Array.from(select.options).some(option => option.value === id)) {
        select.value = id;
    }
}

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
        if (!currentNote || loading || document.hidden) return;
        loadNote(currentNote.id, { silent: true });
    }, POLL_INTERVAL_MS);
}

export async function loadNote(id, { silent = false, force = false } = {}) {
    const editor = document.getElementById('docInput');
    if (!editor || !id) return;

    loading = true;
    try {
        const response = await fetch(notePath(id), { cache: 'no-store' });
        if (!response.ok) {
            if (!silent) setStatus(`Could not load ${id} (${response.status}).`, 'error');
            return;
        }

        const text = await response.text();
        if (!force && text === lastLoadedText) return;
        const front = splitFrontmatter(text);

        if (silent && !force && editor.value !== lastLoadedBody) {
            setStatus('Agent update available — click Reload.', 'muted');
            return;
        }

        applyMeta(front.meta);
        editor.value = front.body;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        scheduleRender();

        currentNote = { id, path: notePath(id) };
        lastLoadedText = text;
        lastLoadedBody = front.body;
        markSelected(id);
        setStatus(`Loaded ${id}`, 'ok');
        startPolling();
    } catch (err) {
        if (!silent) setStatus(`Failed to load ${id}: ${err.message}`, 'error');
    } finally {
        loading = false;
    }
}

export async function reloadCurrentNote() {
    if (!currentNote) {
        setStatus('Choose a note first.', 'muted');
        return;
    }
    await loadNote(currentNote.id, { force: true });
}

export async function initNotes() {
    const select = document.getElementById('notesSelect');
    if (!select) return;

    const [publicNotes, privateNotes] = await Promise.all([
        fetchIndex(PUBLIC_INDEX),
        fetchIndex(PRIVATE_INDEX)
    ]);

    entries = [...publicNotes, ...privateNotes];
    populateSelect();

    select.addEventListener('change', () => {
        if (select.value) loadNote(select.value);
    });

    const reload = document.getElementById('reloadNoteBtn');
    if (reload) reload.addEventListener('click', reloadCurrentNote);

    if (!entries.length) {
        setStatus('No notes yet. Ask an MCP agent to create one.', 'muted');
    }

    const requested = new URLSearchParams(window.location.search).get('note');
    if (requested) {
        await loadNote(requested, { force: true });
        startPolling();
    }

    window.ScriptForgeNotes = {
        entries,
        loadNote,
        reloadCurrentNote,
        reload: reloadCurrentNote,
        get current() {
            return currentNote;
        }
    };
}

export default initNotes;
