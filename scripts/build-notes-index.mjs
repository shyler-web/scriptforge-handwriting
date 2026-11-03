#!/usr/bin/env node
/**
 * Regenerates notes/index.json (public) and notes/private/index.json (private).
 * Private notes and their index are git-ignored.
 */

import { createNotesStore } from '../mcp/notes-store.mjs';

const store = createNotesStore({ root: process.env.SCRIPTFORGE_NOTES_ROOT || undefined });

const rebuilt = await store.rebuildAll();
process.stdout.write(
    `Public notes: ${rebuilt.public.notes.length}\n` +
    `Private notes: ${rebuilt.private.notes.length}\n` +
    `Updated ${store.notesDir}/index.json and ${store.privateDir}/index.json\n`
);
