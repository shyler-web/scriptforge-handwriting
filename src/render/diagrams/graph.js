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
 */

// Geometry of the figure box, in the local coordinate space where (0,0) is
// the top-left corner. The renderer translates by (startX, startY).
const NODE_R = 17;          // a vertex is drawn in a 34 x 34 box
const LEVEL_GAP = 74;       // vertical pitch between two levels
const COL_GAP = 74;         // vertical pitch inside a bipartite column
const MIN_SEPARATION = 30;  // minimum centre-to-centre distance
const CIRCLE_HEIGHT = 260; // a circular figure is never taller than this

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
 * Forward-only adjacency: a directed edge contributes u -> v, an undirected
 * edge contributes both ways. The longest-path pass walks this list, so a
 * backward edge can never pull a vertex back down a level.
 */
function buildForwardAdjacency(spec) {
    const adjacency = new Map(spec.nodes.map((n) => [n.id, []]));
    for (const edge of spec.edges) {
        if (edge.u === edge.v) continue;
        adjacency.get(edge.u).push(edge.v);
        if (!edge.directed) adjacency.get(edge.v).push(edge.u);
    }
    return adjacency;
}

/**
 * Longest-path layering over a DAG (Kahn's algorithm): a vertex sits one
 * level below its deepest predecessor. Returns null when the edge set has a
 * cycle, because a longest path is then undefined.
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
 * BFS distance from every vertex, keeping the maximum distance reached for
 * each one. This is the layering used when the edge set has a cycle: a second
 * pass from every node, keeping the maximum depth.
 */
function eccentricityLayers(spec, adjacency) {
    const depth = new Map(spec.nodes.map((n) => [n.id, 0]));
    for (const root of spec.nodes) {
        const seen = new Set([root.id]);
        const queue = [root.id];
        let distance = 0;
        while (queue.length) {
            distance++;
            const nextQueue = [];
            for (const id of queue) {
                for (const neighbour of adjacency.get(id) || []) {
                    if (seen.has(neighbour)) continue;
                    seen.add(neighbour);
                    nextQueue.push(neighbour);
                    if (distance > depth.get(neighbour)) depth.set(neighbour, distance);
                }
            }
            queue = nextQueue;
        }
    }
    return depth;
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
    const maxLayer = Math.max(0, ...layer.values());
    for (const node of spec.nodes) {
        if (!layer.has(node.id)) layer.set(node.id, maxLayer + 1);
    }
    return layer;
}

/**
 * Orders the vertices inside each layer to reduce edge crossings, using the
 * barycentre heuristic. Two sweeps - down then up - is enough for the figures
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
            const neighboursIn = new Set(layers[neighbourLayer] || []);
            const scored = layers[layerIndex].map((id) => {
                const neighbours = (adjacency.get(id) || []).filter((n) => neighboursIn.has(n));
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
 * The vertex a tree is drawn from: the one with no incoming directed edge,
 * falling back to the first declared vertex.
 */
function pickTreeRoot(spec) {
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
 * The vertex a layered graph is measured from when it has no natural source:
 * the one with the smallest degree, ties broken by declaration order.
 */
function pickSmallestDegreeRoot(spec, adjacency) {
    let best = spec.nodes[0].id;
    let bestDegree = Infinity;
    for (const node of spec.nodes) {
        const degree = (adjacency.get(node.id) || []).length;
        if (degree < bestDegree) {
            bestDegree = degree;
            best = node.id;
        }
    }
    return best;
}

/**
 * Places a tree with the root at the top, children in depth order, parents
 * above children, and siblings spread horizontally.
 */
function placeTree(spec, adjacency, positions, usable) {
    const rootId = pickTreeRoot(spec);
    const children = new Map(spec.nodes.map((n) => [n.id, []]));
    const hasParent = new Set();
    for (const edge of spec.edges) {
        if (edge.u === edge.v) continue;
        children.get(edge.u).push(edge.v);
        hasParent.add(edge.v);
    }

    const depth = new Map();
    const order = [];
    const stack = [rootId];
    depth.set(rootId, 0);
    while (stack.length) {
        const id = stack.pop();
        order.push(id);
        for (const child of children.get(id) || []) {
            if (depth.has(child)) continue;
            depth.set(child, depth.get(id) + 1);
            stack.push(child);
        }
    }
    for (const node of spec.nodes) {
        if (!depth.has(node.id)) {
            depth.set(node.id, 0);
            order.push(node.id);
        }
    }

    // Leaves take the next free x slot; an internal node sits at the average
    // of its children, so a subtree stays centred under its parent.
    const leafOrder = [];
    const collectLeaves = (id, seen) => {
        if (seen.has(id)) return;
        seen.add(id);
        const kids = (children.get(id) || []).filter((c) => depth.has(c));
        if (!kids.length) {
            leafOrder.push(id);
            return;
        }
        kids.forEach((kid) => collectLeaves(kid, seen));
    };
    const seen = new Set();
    collectLeaves(rootId, seen);
    for (const node of spec.nodes) {
        if (!seen.has(node.id)) collectLeaves(node.id, seen);
    }

    const step = Math.min(120, usable / Math.max(1, leafOrder.length + 1));
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
    placeUp(rootId);

    for (const node of spec.nodes) {
        positions[node.id] = {
            x: xOf.get(node.id) ?? NODE_R,
            y: (depth.get(node.id) || 0) * LEVEL_GAP + NODE_R
        };
    }
}

/**
 * Pushes any two vertices that are closer than `minDist` apart, so no two
 * circles overlap. The pass is capped so it always terminates.
 *
 * `axis` is 'x' for the row-based layouts: a vertex must keep its row, so
 * only its horizontal position may move. For a circular layout the vertices
 * are pushed apart in any direction.
 */
function separateVertices(positions, ids, minDist, axis) {
    for (let iteration = 0; iteration < 40; iteration++) {
        let moved = false;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = positions[ids[i]];
                const b = positions[ids[j]];
                if (!a || !b) continue;
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let distance = Math.hypot(dx, dy);
                if (distance >= minDist) continue;
                if (axis === 'x') {
                    const gap = minDist - Math.abs(dx);
                    const direction = dx === 0 ? (i < j ? 1 : -1) : Math.sign(dx);
                    a.x -= direction * gap * 0.5;
                    b.x += direction * gap * 0.5;
                } else {
                    if (distance === 0) {
                        dx = 0.001;
                        dy = 0.001;
                        distance = Math.hypot(dx, dy);
                    }
                    const push = (minDist - distance) * 0.5 + 0.01;
                    a.x -= (dx / distance) * push;
                    a.y -= (dy / distance) * push;
                    b.x += (dx / distance) * push;
                    b.y += (dy / distance) * push;
                }
                moved = true;
            }
        }
        if (!moved) break;
    }
}

/**
 * Computes vertex positions for a spec.
 *
 * Returns `{ positions, width, height, routedEdges }`. `positions` is a plain
 * object of id -> {x, y} in a local box whose top-left corner is (0,0); the
 * renderer offsets them by (startX, startY).
 */
export function computeGraphLayout(spec, opts = {}) {
    const availWidth = Number.isFinite(opts.availWidth) ? opts.availWidth : 680;
    const positions = {};
    const routedEdges = [];

    if (!spec || !spec.nodes.length) {
        return { positions, width: 0, height: 0, routedEdges };
    }

    const ids = spec.nodes.map((n) => n.id);
    const usable = Math.max(120, availWidth - 2 * NODE_R);
    const adjacency = buildAdjacency(spec);
    let rows = null;

    if (spec.layout === 'circular') {
        // The circle has to fit inside availWidth x CIRCLE_HEIGHT.
        const radius = Math.max(NODE_R, Math.min(usable / 2, CIRCLE_HEIGHT / 2 - NODE_R));
        const centreX = usable / 2;
        const centreY = radius + NODE_R;
        ids.forEach((id, index) => {
            const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
            positions[id] = {
                x: centreX + radius * Math.cos(angle),
                y: centreY + radius * Math.sin(angle)
            };
        });
        separateVertices(positions, ids, MIN_SEPARATION, 'both');
    } else if (spec.layout === 'bipartite') {
        const groups = spec.groups || [ids, []];
        const left = groups[0] || [];
        const right = groups[1] || [];
        const leftX = usable * 0.25;
        const rightX = usable * 0.75;

        const column = (members, x) => {
            const total = Math.max(0, members.length - 1) * COL_GAP;
            const top = NODE_R + 12;
            members.forEach((id, index) => {
                positions[id] = { x, y: top + index * COL_GAP };
            });
            return total;
        };
        const leftSpan = column(left, leftX);
        const rightSpan = column(right, rightX);
        // Both columns are centred against each other.
        const shift = (rightSpan - leftSpan) / 2;
        for (const id of left) positions[id].y += shift;
        for (const id of right) positions[id].y -= shift;

        separateVertices(positions, ids, MIN_SEPARATION, 'x');
    } else if (spec.layout === 'tree') {
        placeTree(spec, adjacency, positions, usable);
        separateVertices(positions, ids, MIN_SEPARATION, 'x');
    } else {
        // layered and hasse both stack rows vertically.
        const allDirected = spec.edges.length > 0 && spec.edges.every((e) => e.directed);

        if (spec.layout === 'hasse') {
            const levelOf = (id) => (Object.prototype.hasOwnProperty.call(spec.levels, id) ? spec.levels[id] : 0);
            const maxLevel = Math.max(0, ...ids.map(levelOf));
            const byLevel = new Map();
            for (const id of ids) {
                const level = levelOf(id);
                if (!byLevel.has(level)) byLevel.set(level, []);
                byLevel.get(level).push(id);
            }
            rows = [];
            for (let level = 0; level <= maxLevel; level++) rows.push(byLevel.get(level) || []);
        } else if (allDirected) {
            // A digraph is layered by longest path: a vertex sits one row
            // below its deepest predecessor.
            const forward = buildForwardAdjacency(spec);
            const depth = longestPathLayers(spec, forward)
                || eccentricityLayers(spec, adjacency)
                || bfsLayers(spec, adjacency, pickSmallestDegreeRoot(spec, adjacency));
            const byDepth = new Map();
            for (const id of ids) {
                const d = depth.get(id) || 0;
                if (!byDepth.has(d)) byDepth.set(d, []);
                byDepth.get(d).push(id);
            }
            rows = [];
            for (let d = 0; d <= Math.max(0, ...byDepth.keys()); d++) rows.push(byDepth.get(d) || []);
            rows = orderLayersByBarycentre(rows, adjacency);
        } else {
            // An undirected forest is already a tree, and a tree drawn in
            // levels is exactly a layered graph: the root on top, its
            // children below it.
            placeTree(spec, adjacency, positions, usable);
            rows = null;
        }

        if (rows) {
            const rowCount = rows.length;
            rows.forEach((rowIds, index) => {
                const step = rowIds.length ? Math.min(110, usable / rowIds.length) : 0;
                const span = step * Math.max(0, rowIds.length - 1);
                const startX = (usable - span) / 2;
                rowIds.forEach((id, column) => {
                    const y = spec.layout === 'hasse'
                        ? (rowCount - 1 - index) * LEVEL_GAP + NODE_R
                        : index * LEVEL_GAP + NODE_R;
                    positions[id] = { x: startX + column * step, y };
                });
            });
        }

        separateVertices(positions, ids, MIN_SEPARATION, 'x');
    }

    // --- the bounding box --------------------------------------------------
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
        const point = positions[id];
        if (!point) continue;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) {
        minX = 0;
        maxX = 0;
        minY = 0;
        maxY = 0;
    }

    let width = (maxX - minX) + 2 * NODE_R;
    let height = (maxY - minY) + 2 * NODE_R;

    // Shift the figure so its top-left corner is the origin.
    for (const id of ids) {
        const point = positions[id];
        if (!point) continue;
        point.x -= minX - NODE_R;
        point.y -= minY - NODE_R;
    }

    // A figure wider than the column is scaled down, unless that would push
    // two vertices closer together than the minimum separation.
    if (width > availWidth && ids.length > 1) {
        const scale = availWidth / width;
        const scaled = ids.map((id) => ({ id, x: positions[id].x * scale, y: positions[id].y }));
        let minGap = Infinity;
        for (let i = 0; i < scaled.length; i++) {
            for (let j = i + 1; j < scaled.length; j++) {
                minGap = Math.min(minGap, Math.hypot(scaled[i].x - scaled[j].x, scaled[i].y - scaled[j].y));
            }
        }
        if (minGap >= MIN_SEPARATION) {
            for (const point of scaled) positions[point.id].x = point.x;
            width = availWidth;
        }
    }

    // --- route the edges ---------------------------------------------------
    for (const edge of spec.edges) {
        const from = positions[edge.u];
        const to = positions[edge.v];
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
            const sameRow = Math.abs(from.y - to.y) < 1;
            if (sameRow) {
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

    return { positions, width, height, routedEdges };
}
