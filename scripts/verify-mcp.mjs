#!/usr/bin/env node
/**
 * End-to-end MCP stdio smoke test.
 * Verifies initialize, tools/list, tools/call, validation failures, Content-Length
 * framing and public/private index isolation without any external dependency.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const serverPath = resolve(import.meta.dirname, '../mcp/server.mjs');
const root = await mkdtemp(join(tmpdir(), 'scriptforge-mcp-'));
const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, SCRIPTFORGE_NOTES_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe']
});

let stdoutBuffer = '';
let stderr = '';
const responses = new Map();

child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
});

child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let newline;
    while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.id !== undefined && message.id !== null) responses.set(message.id, message);
    }
});

function sendJson(message) {
    child.stdin.write(JSON.stringify(message) + '\n');
}

function sendFramed(message) {
    const body = JSON.stringify(message);
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

async function waitFor(ids, timeoutMs = 5000) {
    const started = Date.now();
    while (!ids.every(id => responses.has(id))) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`Timed out waiting for MCP ids ${ids.join(', ')}.\nstderr:\n${stderr}`);
        }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
}

function textPayload(response) {
    return response.result.content[0].text;
}

let passed = 0;
function pass(name) {
    passed++;
    process.stdout.write(`  ok ${name}\n`);
}

try {
    sendJson({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'verify-mcp', version: '1.0.0' }
        }
    });
    sendJson({ jsonrpc: '2.0', method: 'notifications/initialized' });
    sendJson({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    sendFramed({ jsonrpc: '2.0', id: 3, method: 'ping' });
    sendJson({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
            name: 'create_note',
            arguments: {
                slug: 'dsa/trees',
                title: 'Trees',
                tags: ['dsa', 'trees'],
                content: '# Trees\n\nA tree with $n$ nodes has $n-1$ edges.\n\n$$ \\sum_{i=1}^{n} 1 = n $$\n\n[DIAGRAM: graph | nodes=A,B,C | edges=A-B,B-C | layout=auto]'
            }
        }
    });
    sendJson({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'create_note', arguments: { slug: 'private/scratch', content: '# Scratch' } }
    });
    sendJson({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'validate_note', arguments: { content: '[DIAGRAM: quantum | x=1]' } }
    });
    sendJson({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_notes', arguments: {} } });
    sendJson({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'read_note', arguments: { slug: 'dsa/trees' } }
    });

    await waitFor([1, 2, 3, 4, 5, 6, 7, 8]);

    assert.equal(responses.get(1).result.serverInfo.name, 'scriptforge-notes');
    assert.equal(responses.get(1).result.protocolVersion, '2025-06-18');
    pass('initialize handshake');

    const toolNames = responses.get(2).result.tools.map(t => t.name);
    for (const expected of ['get_authoring_guide', 'list_notes', 'read_note', 'create_note', 'update_note', 'append_to_note', 'delete_note', 'validate_note']) {
        assert.ok(toolNames.includes(expected), `missing tool ${expected}`);
    }
    pass('tools/list exposes the full tool set');

    assert.deepEqual(responses.get(3).result, {});
    pass('Content-Length framed request is accepted');

    const created = JSON.parse(textPayload(responses.get(4)));
    assert.equal(created.created, true);
    assert.equal(created.scope, 'public');
    assert.equal(created.path, '/notes/dsa/trees.md');
    pass('create_note writes a public note');

    const privateCreated = JSON.parse(textPayload(responses.get(5)));
    assert.equal(privateCreated.scope, 'private');
    assert.equal(privateCreated.path, '/notes/private/scratch.md');
    pass('private/ slug infers private scope');

    assert.equal(responses.get(6).result.isError, true);
    assert.match(textPayload(responses.get(6)), /Unknown diagram type "quantum"/);
    assert.match(textPayload(responses.get(6)), /line 1/);
    pass('validate_note returns line-numbered correction');

    const listed = JSON.parse(textPayload(responses.get(7)));
    assert.equal(listed.count, 1);
    assert.equal(listed.notes[0].id, 'dsa/trees');
    pass('list_notes is public-only');

    const read = JSON.parse(textPayload(responses.get(8)));
    assert.equal(read.title, 'Trees');
    assert.match(read.content, /\\sum_\{i=1\}\^\{n\}/);
    pass('read_note returns content and frontmatter');

    const publicIndex = JSON.parse(await readFile(join(root, 'notes', 'index.json'), 'utf8'));
    assert.equal(publicIndex.notes.length, 1);
    assert.equal(publicIndex.notes.some(n => n.id.includes('private')), false);
    const privateIndex = JSON.parse(await readFile(join(root, 'notes', 'private', 'index.json'), 'utf8'));
    assert.equal(privateIndex.notes.length, 1);
    pass('public and private indexes are isolated on disk');

    process.stdout.write(`\nverify-mcp: ${passed} checks passed\n`);
} finally {
    child.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
}
