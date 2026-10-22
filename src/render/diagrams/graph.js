/**
 * ScriptForge Universal Graph Engine (`src/render/diagrams/graph.js`)
 *
 * Grammar 6 - the general-graph engine. Renders:
 *   1. General undirected graphs      `[DIAGRAM: graph | nodes=A,B,C | edges=A-B,B-C]`
 *   2. Directed graphs                `... | edges=A->B,B->C | directed=true`
 *   3. Hasse diagrams of a poset      `... | layout=hasse | levels=1:0,2:1,4:2`
 *   4. Bipartite graphs               `... | nodes=A,B|C,D | layout=bipartite`
 *   5. Layered / hierarchical graphs  `... | layout=layered`
 *   6. Trees                          `... | layout=tree`
 *
 * The spec parser and the layout engine are pure functions over plain data so
 * that they can be unit-tested in plain Node, without a DOM or a canvas.
 * The drawing routine lives further down this file and is added by the wave
 * that needs it.
 */

// Geometry of the figure box, in the local coordinate space where (0,0) is
// the top-left corner. The renderer translates by (startX, startY).
const NODE_R = 20;
const LEVEL_GAP = 92;
const SIDE_GAP = 220;
const COL_GAP = 74;
const MAX_WIDTH = 660;

/**
 * Splits a comma-separated parameter value into trimmed, non-empty parts.
 */
function splitList(raw) {
    return String(raw || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

/**
 * True when the undirected edge set contains a cycle. Used to pick a default
 * layout: an acyclic graph reads well layered, a cyclic one reads well on a
 * circle.
 */
function hasCycle(nodes, edges) {
    const adjacency = new Map(nodes.map((n) => [n.id, []]));
    for (const edge of edges) {
        if (edge.u === edge.v) continue;
        adjacency.get(edge.u).push(edge.v);
        adjacency.get(edge.v).push(edge.u);
    }

    const visited = new Set();
    for (const node of nodes) {
        if (visited.has(node.id)) continue;
        const stack = [[node.id, null]];
        while (stack.length) {
            const [id, parent] = stack.pop();
            if (visited.has(id)) continue;
            visited.add(id);
            for (const next of adjacency.get(id) || []) {
                if (next === parent) continue;
                if (visited.has(next)) return true;
                stack.push([next, id]);
            }
        }
    }
    return false;
}

/**
 * Parses a `[DIAGRAM: graph | ...]` parameter bag into a plain-data spec.
 *
 * `params` is the key/value bag produced by `parseDiagramSpec` in
 * `src/render/diagrams/index.js`. Nothing here touches the DOM.
 */
export function parseGraphSpec(params = {}) {
    const warnings = [];

    // --- nodes -------------------------------------------------------------
    // A `|` separates the two sides of a bipartite graph. Every other side
    // syntax is `id` or `id:label`.
    const rawNodes = String(params.nodes || '');
    const groups = [];
    const nodes = [];
    const seenIds = new Set();

    const sides = rawNodes.includes('|') ? rawNodes.split('|') : [rawNodes];
    for (const side of sides) {
        const ids = [];
        for (const entry of splitList(side)) {
            const colon = entry.indexOf(':');
            const id = (colon === -1 ? entry : entry.slice(0, colon)).trim();
            const label = (colon === -1 ? id : entry.slice(colon + 1).trim()) || id;
            if (!id) continue;
            if (seenIds.has(id)) {
                warnings.push(`duplicate node id "${id}" ignored`);
                continue;
            }
            seenIds.add(id);
            ids.push(id);
            nodes.push({ id, label });
        }
        if (ids.length) groups.push(ids);
    }

    // A single side means there is no bipartition to speak of.
    const nodeGroups = groups.length > 1 ? groups : null;

    // --- edges -------------------------------------------------------------
    const declared = new Set(nodes.map((n) => n.id));
    const globalDirected = String(params.directed || '').toLowerCase() === 'true';
    const edges = [];
    const edgeKeys = new Set();

    for (const entry of splitList(params.edges)) {
        const colon = entry.indexOf(':');
        const pair = (colon === -1 ? entry : entry.slice(0, colon)).trim();
        const label = colon === -1 ? '' : entry.slice(colon + 1).trim();

        const arrow = pair.indexOf('->');
        let u;
        let v;
        let directed;
        if (arrow !== -1) {
            u = pair.slice(0, arrow).trim();
            v = pair.slice(arrow + 2).trim();
            directed = true;
        } else {
            const dash = pair.indexOf('-');
            if (dash === -1) {
                warnings.push(`edge "${entry}" is not a u-v or u->v pair - ignored`);
                continue;
            }
            u = pair.slice(0, dash).trim();
            v = pair.slice(dash + 1).trim();
            directed = false;
        }

        if (!u || !v) {
            warnings.push(`edge "${entry}" has an empty endpoint - ignored`);
            continue;
        }
        if (!declared.has(u) || !declared.has(v)) {
            warnings.push(`edge "${entry}" names a vertex that was not declared - ignored`);
            continue;
        }

        // Duplicate suppression. A directed edge keeps its own ordered key, so
        // u->v and v->u are two different edges of a digraph; an undirected
        // edge is keyed by its sorted pair, so A-B and B-A are the same edge.
        const sorted = u < v ? `${u}-${v}` : `${v}-${u}`;
        const key = directed ? `${u}->${v}` : sorted;
        if (edgeKeys.has(key) || edgeKeys.has(sorted)) continue;
        edgeKeys.add(key);
        edgeKeys.add(sorted);

        edges.push({ u, v, directed: directed || globalDirected, label });
    }

    // --- levels ------------------------------------------------------------
    const levels = {};
    for (const entry of splitList(params.levels)) {
        const colon = entry.indexOf(':');
        if (colon === -1) continue;
        const id = entry.slice(0, colon).trim();
        const level = parseInt(entry.slice(colon + 1).trim(), 10);
        if (!id || !Number.isFinite(level)) continue;
        levels[id] = level;
    }
    const hasLevels = Object.keys(levels).length > 0;

    // --- layout ------------------------------------------------------------
    let layout = String(params.layout || '').toLowerCase();
    const validLayouts = ['auto', 'layered', 'circular', 'bipartite', 'tree', 'hasse'];
    if (!validLayouts.includes(layout)) layout = 'auto';
    if (layout === 'auto') {
        if (hasLevels) layout = 'hasse';
        else if (nodeGroups) layout = 'bipartite';
        else layout = hasCycle(nodes, edges) ? 'circular' : 'layered';
    }

    // --- caption -----------------------------------------------------------
    // The dispatcher splits a whole spec on `|`, so a pipe inside a value
    // would truncate it. The caption is sanitised rather than trusted.
    const caption = String(params.caption || '').replace(/\|/g, ' ').trim();

    return {
        nodes,
        edges,
        layout,
        levels,
        highlight: splitList(params.highlight),
        highlightNodes: splitList(params.highlightNodes),
        showDegrees: String(params.showDegrees || '').toLowerCase() === 'true',
        directed: globalDirected,
        caption,
        groups: nodeGroups,
        warnings
    };
}

/**
 * Adjacency list of a spec: id -> array of neighbour ids.
 */
function buildAdjacency(spec) {
    const adjacency = new Map(spec.nodes.map((n) => [n.id, []]));
    for (const edge of spec.edges) {
        if (edge.u === edge.v) continue;
        adjacency.get(edge.u).push(edge.v);
        adjacency.get(edge.v).push(edge.u);
    }
    return adjacency;
}

/**
 * Places the vertices of one layer along the x axis, centred.
 */
function spreadLayer(ids, width) {
    const positions = new Map();
    if (!ids.length) return positions;
    const step = Math.min(110, width / (ids.length + 1));
    const span = step * (ids.length - 1);
    const startX = (width - span) / 2;
    ids.forEach((id, index) => {
        positions.set(id, { x: startX + index * step, y: 0 });
    });
    return positions;
}

/**
 * Longest-path layering over a DAG (Kahn's algorithm). Returns null when the
 * edge set contains a cycle, so the caller can fall back to BFS distances.
 */
function longestPathLayers(spec, adjacency) {
    const indegree = new Map(spec.nodes.map((n) => [n.id, 0]));
    for (const edge of spec.edges) {
        if (edge.u === edge.v) continue;
        indegree.set(edge.v, (indegree.get(edge.v) || 0) + 1);
    }

    const layer = new Map();
    const queue = [];
    for (const node of spec.nodes) {
        if ((indegree.get(node.id) || 0) === 0) {
            queue.push(node.id);
            layer.set(node.id, 0);
        }
    }
    if (!queue.length) return null;

    let processed = 0;
    while (queue.length) {
        const id = queue.shift();
        processed++;
        for (const next of adjacency.get(id) || []) {
            const candidate = layer.get(id) + 1;
            if (candidate > (layer.get(next) ?? -1)) layer.set(next, candidate);
            indegree.set(next, (indegree.get(next) || 0) - 1);
            if (indegree.get(next) === 0) queue.push(next);
        }
    }
    if (processed !== spec.nodes.length) return null;
    return layer;
}

/**
 * BFS distance layering from a chosen root.
 */
function bfsLayers(spec, adjacency, rootId) {
    const layer = new Map();
    const queue = [rootId];
    layer.set(rootId, 0);
    while (queue.length) {
        const id = queue.shift();
        for (const next of adjacency.get(id) || []) {
            if (!layer.has(next)) {
                layer.set(next, layer.get(id) + 1);
                queue.push(next);
            }
        }
    }
    // Vertices unreachable from the root are parked on the last layer.
    const maxLayer = Math.max(0, ...layer.values());
    for (const node of spec.nodes) {
        if (!layer.has(node.id)) layer.set(node.id, maxLayer + 1);
    }
    return layer;
}

/**
 * Orders the vertices inside each layer to reduce edge crossings, using the
 * barycentre heuristic. Two sweeps (down then up) is enough for the figures
 * the notebook needs.
 */
function orderLayersByBarycentre(layers, adjacency) {
    const positionOf = new Map();
    const reindex = () => {
        positionOf.clear();
        for (const ids of layers) {
            ids.forEach((id, index) => positionOf.set(id, index));
        }
    };
    reindex();

    for (let pass = 0; pass < 2; pass++) {
        const down = pass === 0;
        const indices = down
            ? layers.map((_, i) => i).slice(1)
            : layers.map((_, i) => i).slice(0, -1).reverse();

        for (const layerIndex of indices) {
            const neighbourLayer = down ? layerIndex - 1 : layerIndex + 1;
            const scored = layers[layerIndex].map((id) => {
                const neighbours = (adjacency.get(id) || []).filter((n) =>
                    layers[neighbourLayer] && layers[neighbourLayer].includes(n));
                const barycentre = neighbours.length
                    ? neighbours.reduce((sum, n) => sum + positionOf.get(n), 0) / neighbours.length
                    : positionOf.get(id);
                return { id, barycentre };
            });
            scored.sort((a, b) => a.barycentre - b.barycentre);
            layers[layerIndex] = scored.map((s) => s.id);
            reindex();
        }
    }
    return layers;
}

/**
 * Computes vertex positions for a spec.
 *
 * Returns `{ positions, width, height, routedEdges }` where `positions` is a
 * Map of id -> {x, y} in a local box whose top-left corner is (0,0).
 */
export function computeLayout(spec, availWidth = 640) {
    const positions = new Map();
    const routedEdges = [];
    const width = Math.max(200, Math.min(availWidth || 640, MAX_WIDTH));

    if (!spec || !spec.nodes.length) {
        return { positions, width: 0, height: 0, routedEdges };
    }

    const adjacency = buildAdjacency(spec);
    const ids = spec.nodes.map((n) => n.id);

    // --- group the vertices into layers -----------------------------------
    let layers = [];

    if (spec.layout === 'hasse') {
        const maxLevel = Math.max(0, ...ids.map((id) => (spec.levels[id] ?? 0)));
        const byLevel = new Map();
        for (const id of ids) {
            const level = spec.levels[id] ?? 0;
            if (!byLevel.has(level)) byLevel.set(level, []);
            byLevel.get(level).push(id);
        }
        // Layers are built in ascending level order (level 0 first). The
        // placement below then pushes level 0 to the bottom of the box and
        // the highest level to the top, which is the Hasse convention.
        for (let level = 0; level <= maxLevel; level++) {
            layers.push(byLevel.get(level) || []);
        }
    } else if (spec.layout === 'bipartite') {
        const groups = spec.groups || [ids];
        const left = groups[0] || [];
        const right = groups[1] || [];
        layers = [left, right];
    } else if (spec.layout === 'tree') {
        const depth = bfsLayers(spec, adjacency, pickTreeRoot(spec, adjacency));
        const byDepth = new Map();
        for (const id of ids) {
            const d = depth.get(id) || 0;
            if (!byDepth.has(d)) byDepth.set(d, []);
            byDepth.get(d).push(id);
        }
        for (let d = 0; d <= Math.max(0, ...byDepth.keys()); d++) layers.push(byDepth.get(d) || []);
    } else if (spec.layout === 'circular') {
        layers = [ids];
    } else {
        // layered
        const layered = longestPathLayers(spec, adjacency);
        const depth = layered || bfsLayers(spec, adjacency, pickRoot(spec, adjacency));
        const byDepth = new Map();
        for (const id of ids) {
            const d = depth.get(id) || 0;
            if (!byDepth.has(d)) byDepth.set(d, []);
            byDepth.get(d).push(id);
        }
        for (let d = 0; d <= Math.max(0, ...byDepth.keys()); d++) layers.push(byDepth.get(d) || []);
        layers = orderLayersByBarycentre(layers, adjacency);
    }

    // --- place the vertices ------------------------------------------------
    if (spec.layout === 'circular') {
        const radius = Math.max(70, ids.length * 26);
        const cx = width / 2;
        const cy = radius + NODE_R + 8;
        ids.forEach((id, index) => {
            const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
            positions.set(id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        });
    } else if (spec.layout === 'bipartite') {
        const left = layers[0] || [];
        const right = layers[1] || [];
        const leftIndex = new Map(left.map((id, i) => [id, i]));
        const rightIndex = new Map(right.map((id, i) => [id, i]));

        const columnY = (idsInColumn, otherIndex) => {
            const total = (idsInColumn.length - 1) * COL_GAP;
            const top = NODE_R + 12;
            idsInColumn.forEach((id, index) => {
                const neighbours = (adjacency.get(id) || []).filter((n) => otherIndex.has(n));
                const barycentre = neighbours.length
                    ? neighbours.reduce((sum, n) => sum + otherIndex.get(n), 0) / neighbours.length
                    : index;
                positions.set(id, { x: 0, y: top + index * COL_GAP, _bary: barycentre });
            });
            // Re-sort the column by barycentre, then re-assign the y values.
            const sorted = [...idsInColumn].sort((a, b) => positions.get(a)._bary - positions.get(b)._bary);
            sorted.forEach((id, index) => {
                const point = positions.get(id);
                point.y = top + index * COL_GAP;
                delete point._bary;
            });
            return total;
        };
        columnY(left, rightIndex);
        columnY(right, leftIndex);
        for (const id of ids) {
            const point = positions.get(id);
            point.x = id && rightIndex.has(id) ? SIDE_GAP : 0;
        }
    } else if (spec.layout === 'tree') {
        placeTree(spec, adjacency, positions, width);
    } else {
        // layered and hasse both stack their layers vertically.
        const levelCount = layers.length;
        layers.forEach((layerIds, depth) => {
            const spread = spreadLayer(layerIds, width);
            for (const [id, point] of spread) {
                const y = spec.layout === 'hasse'
                    ? (levelCount - 1 - depth) * LEVEL_GAP + NODE_R
                    : depth * LEVEL_GAP + NODE_R;
                positions.set(id, { x: point.x, y });
            }
        });
    }

    // --- route the edges ---------------------------------------------------
    for (const edge of spec.edges) {
        const from = positions.get(edge.u);
        const to = positions.get(edge.v);
        if (!from || !to) continue;

        let points;
        if (edge.u === edge.v) {
            points = [
                { x: from.x, y: from.y - NODE_R - 16 },
                { x: from.x + NODE_R + 18, y: from.y - NODE_R - 6 },
                { x: from.x, y: from.y - NODE_R }
            ];
        } else if (spec.layout === 'bipartite') {
            const midX = (from.x + to.x) / 2;
            points = [
                { x: from.x, y: from.y },
                { x: midX, y: from.y },
                { x: midX, y: to.y },
                { x: to.x, y: to.y }
            ];
        } else if (spec.layout === 'circular' || spec.layout === 'tree') {
            points = [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
        } else {
            const sameLayer = Math.abs(from.y - to.y) < 1;
            if (sameLayer) {
                points = [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
            } else {
                const midY = (from.y + to.y) / 2;
                points = [
                    { x: from.x, y: from.y },
                    { x: from.x, y: midY },
                    { x: to.x, y: midY },
                    { x: to.x, y: to.y }
                ];
            }
        }
        routedEdges.push({ ...edge, points });
    }

    // --- the bounding box --------------------------------------------------
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const point of positions.values()) {
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
    }
    if (!Number.isFinite(minY)) {
        minY = 0;
        maxY = 0;
    }

    const height = (maxY - minY) + 2 * NODE_R + 20;
    const boxWidth = Math.max(width, (maxX - minX) + 2 * NODE_R + 20);

    return { positions, width: boxWidth, height, routedEdges };
}

/**
 * The vertex a tree is drawn from: the one with no incoming edge, falling
 * back to the first declared vertex.
 */
function pickTreeRoot(spec, adjacency) {
    const hasParent = new Set();
    for (const edge of spec.edges) {
        if (!edge.directed) continue;
        hasParent.add(edge.v);
    }
    for (const node of spec.nodes) {
        if (!hasParent.has(node.id)) return node.id;
    }
    return spec.nodes[0].id;
}

/**
 * The vertex a layered graph is drawn from: the highest-degree one, with ties
 * broken by declaration order.
 */
function pickRoot(spec, adjacency) {
    let best = spec.nodes[0].id;
    let bestDegree = -1;
    for (const node of spec.nodes) {
        const degree = (adjacency.get(node.id) || []).length;
        if (degree > bestDegree) {
            bestDegree = degree;
            best = node.id;
        }
    }
    return best;
}

/**
 * Places a tree with the root at the top, children spread evenly under
 * their parent, and the subtree of each child centred on it.
 */
function placeTree(spec, adjacency, positions, width) {
    const rootId = pickTreeRoot(spec, adjacency);
    const children = new Map(spec.nodes.map((n) => [n.id, []]));
    const hasParent = new Set();
    for (const edge of spec.edges) {
        if (edge.u === edge.v) continue;
        children.get(edge.u).push(edge.v);
        hasParent.add(edge.v);
    }

    const root = spec.nodes.find((n) => !hasParent.has(n.id));
    const actualRoot = root ? root.id : rootId;

    const depth = new Map();
    const parent = new Map();
    const order = [];
    const stack = [actualRoot];
    depth.set(actualRoot, 0);
    while (stack.length) {
        const id = stack.pop();
        order.push(id);
        for (const child of children.get(id) || []) {
            if (depth.has(child)) continue;
            depth.set(child, depth.get(id) + 1);
            parent.set(child, id);
            stack.push(child);
        }
    }
    for (const node of spec.nodes) {
        if (!depth.has(node.id)) {
            depth.set(node.id, 0);
            parent.set(node.id, actualRoot);
            order.push(node.id);
        }
    }

    // Leaves take the next free x slot in order; internal nodes sit at the
    // average of their children.
    const leafSlots = [];
    const leafOrder = [];
    const collectLeaves = (id) => {
        const kids = (children.get(id) || []).filter((c) => depth.has(c));
        if (!kids.length) {
            leafSlots.push(0);
            leafOrder.push(id);
            return;
        }
        kids.forEach(collectLeaves);
    };
    collectLeaves(actualRoot);
    for (const node of spec.nodes) {
        if (!leafOrder.includes(node.id)) collectLeaves(node.id);
    }

    const step = Math.min(120, width / Math.max(1, leafSlots.length + 1));
    const xOf = new Map();
    leafOrder.forEach((id, index) => xOf.set(id, (index + 1) * step));

    const placeUp = (id) => {
        const kids = (children.get(id) || []).filter((c) => depth.has(c));
        if (!kids.length) return xOf.get(id);
        const xs = kids.map(placeUp).filter((v) => Number.isFinite(v));
        const x = xs.reduce((a, b) => a + b, 0) / xs.length;
        xOf.set(id, x);
        return x;
    };
    placeUp(actualRoot);

    for (const node of spec.nodes) {
        positions.set(node.id, {
            x: xOf.get(node.id) ?? NODE_R,
            y: (depth.get(node.id) || 0) * LEVEL_GAP + NODE_R
        });
    }
}
