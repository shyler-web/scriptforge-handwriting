#!/usr/bin/env node
/**
 * ScriptForge MCP server.
 *
 * Transport: stdio, newline-delimited JSON-RPC 2.0 (MCP 2024-11-05 .. 2025-06-18).
 * A Content-Length header frame is also accepted for clients that send one.
 *
 * stdout is reserved for JSON-RPC messages. Every diagnostic goes to stderr.
 */

import { createNotesStore } from './notes-store.mjs';
import { TOOLS, callTool, getAuthoringGuide } from './tools.mjs';

const SERVER_NAME = 'scriptforge-notes';
const SERVER_VERSION = '1.1.0';
const SUPPORTED_PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18'];
const FALLBACK_PROTOCOL = '2025-06-18';

const store = createNotesStore({
    root: process.env.SCRIPTFORGE_NOTES_ROOT || undefined
});

function log(...args) {
    process.stderr.write(`[scriptforge-mcp] ${args.join(' ')}\n`);
}

function send(message) {
    process.stdout.write(JSON.stringify(message) + '\n');
}

function sendResult(id, result) {
    send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data) {
    send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

function extractMessages(buffer) {
    const messages = [];
    let offset = 0;
    const len = buffer.length;

    while (offset < len) {
        while (offset < len && (buffer[offset] === 0x0a || buffer[offset] === 0x0d)) offset++;
        if (offset >= len) break;

        const headerPeek = buffer.slice(offset, Math.min(offset + 32, len)).toString('utf8');
        if (/^content-length:/i.test(headerPeek)) {
            const crlfEnd = buffer.indexOf('\r\n\r\n', offset);
            const lfEnd = buffer.indexOf('\n\n', offset);
            let headerEnd = -1;
            let sepLength = 0;
            if (crlfEnd !== -1 && (lfEnd === -1 || crlfEnd < lfEnd)) {
                headerEnd = crlfEnd;
                sepLength = 4;
            } else if (lfEnd !== -1) {
                headerEnd = lfEnd;
                sepLength = 2;
            }
            if (headerEnd === -1) break;

            const header = buffer.slice(offset, headerEnd).toString('utf8');
            const match = header.match(/content-length:\s*(\d+)/i);
            if (!match) {
                offset = headerEnd + sepLength;
                continue;
            }
            const bodyStart = headerEnd + sepLength;
            const bodyLength = Number(match[1]);
            if (len < bodyStart + bodyLength) break;
            messages.push(buffer.slice(bodyStart, bodyStart + bodyLength).toString('utf8'));
            offset = bodyStart + bodyLength;
            continue;
        }

        const newline = buffer.indexOf(0x0a, offset);
        if (newline === -1) break;
        const line = buffer.slice(offset, newline).toString('utf8').replace(/\r$/, '').trim();
        offset = newline + 1;
        if (line) messages.push(line);
    }

    return { messages, rest: buffer.slice(offset) };
}

async function handleMessage(raw) {
    let message;
    try {
        message = JSON.parse(raw);
    } catch (err) {
        log(`JSON parse error: ${err.message}`);
        sendError(null, -32700, 'Parse error', { detail: err.message });
        return;
    }

    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
        sendError(message && message.id !== undefined ? message.id : null, -32600, 'Invalid Request');
        return;
    }

    const { id, method, params = {} } = message;
    const isNotification = id === undefined || id === null;

    if (isNotification && typeof method === 'string' && !method.startsWith('tools/')) {
        return;
    }

    if (method === 'initialize') {
        const requested = params && params.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : FALLBACK_PROTOCOL;
        sendResult(id, {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            instructions:
                'ScriptForge note compiler. Call get_authoring_guide before writing notes, then validate_note. ' +
                'Public notes are tracked; private notes live under notes/private and are git-ignored.'
        });
        return;
    }

    if (method === 'notifications/initialized' || method === 'initialized') {
        return;
    }

    if (method === 'ping') {
        if (!isNotification) sendResult(id, {});
        return;
    }

    if (method === 'tools/list') {
        sendResult(id, { tools: TOOLS });
        return;
    }

    if (method === 'tools/call') {
        const name = params && params.name;
        const args = (params && params.arguments) || {};
        if (!name) {
            sendError(id, -32602, 'Invalid params: tools/call requires a tool name');
            return;
        }
        const output = await callTool(name, args, store);
        sendResult(id, output);
        return;
    }

    if (method === 'resources/list') {
        sendResult(id, { resources: [] });
        return;
    }

    if (method === 'prompts/list') {
        sendResult(id, { prompts: [] });
        return;
    }

    if (method === 'resources/templates/list') {
        sendResult(id, { resourceTemplates: [] });
        return;
    }

    if (!isNotification) {
        sendError(id, -32601, `Method not found: ${method}`);
    }
}

let pending = Buffer.alloc(0);
let queue = Promise.resolve();

function enqueue(raw) {
    queue = queue.then(() => handleMessage(raw)).catch((err) => {
        log(`Unhandled request error: ${err.stack || err}`);
        sendError(null, -32603, 'Internal error', { detail: err.message });
    });
    return queue;
}

process.stdin.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const { messages, rest } = extractMessages(pending);
    pending = rest;
    for (const raw of messages) enqueue(raw);
});

process.stdin.on('end', () => {
    if (pending.length) {
        log(`Discarding ${pending.length} trailing byte(s) on stdin close.`);
    }
});

process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.stack || err}`);
});

process.on('unhandledRejection', (err) => {
    log(`Unhandled rejection: ${err && err.stack ? err.stack : err}`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

log(`ready (root=${store.root})`);

// Warm the guide cache so the first tool call is instant, but never on stdout.
getAuthoringGuide().catch(() => {});
