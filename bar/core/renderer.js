// Module-scoped scratch vectors to eliminate per-frame GC allocations
const SCRATCH_PA = [0, 0, 0];
const SCRATCH_PB = [0, 0, 0];
const SCRATCH_PC = [0, 0, 0];
const SCRATCH_EDGE1 = [0, 0, 0];
const SCRATCH_EDGE2 = [0, 0, 0];
const SCRATCH_H = [0, 0, 0];
const SCRATCH_S = [0, 0, 0];
const SCRATCH_Q = [0, 0, 0];
const SCRATCH_RAY_DIR = [0, 0, 0];
const SCRATCH_COMBINED_MAT = Mat4.create();
const EMPTY_TRI_LIST = [];

// Canonical room directory aliases mapping legacy names to modern directory paths
const CANONICAL_ROOM_ALIASES = {
    // Overworld
    'sacred_meadow': 'sacred_forest_meadow',
    'kokiri': 'kokiri_forest',
    'zora_river': 'zoras_river',
    'zora_domain': 'zoras_domain',
    'zora_fountain': 'zoras_fountain',
    'castle_town': 'castle',
    'market': 'castle',
    'castle_grounds': 'hyrule_castle_grounds',
    'ganon_castle_grounds': 'ganons_castle_grounds',
    'ganons_castle': 'ganons_castle_grounds',
    'inside_ganons_castle': 'ganons_castle_grounds',
    'death_mountain': 'death_mountain_trail',
    'crater': 'death_mountain_crater',
    'goron': 'goron_city',
    'wasteland': 'haunted_wasteland',
    'colossus': 'desert_colossus',
    'gerudo_fortress': 'gerudos_fortress',
    // Temples & Dungeons
    'temple_of_spirit': 'spirit_temple',
    'dodongo_cavern': 'dodongos_cavern',
    'jabu_jabu': 'inside_jabu_jabus_belly',
    'jabus_belly': 'inside_jabu_jabus_belly',
    'inside_jabu_jabu': 'inside_jabu_jabus_belly',
    'deku_tree': 'inside_the_deku_tree',
    // Sub-rooms
    'links_house': 'kokiri_forest/links_house',
    'kokiri_forest__links_house': 'kokiri_forest/links_house'
};

const REVERSE_ROOM_ALIASES = {};
for (const [alias, canonical] of Object.entries(CANONICAL_ROOM_ALIASES)) {
    if (!REVERSE_ROOM_ALIASES[canonical]) REVERSE_ROOM_ALIASES[canonical] = [];
    REVERSE_ROOM_ALIASES[canonical].push(alias);
}

function resolveCanonicalRoom(name) {
    if (!name) return name;
    return CANONICAL_ROOM_ALIASES[name] || name;
}

window.CANONICAL_ROOM_ALIASES = CANONICAL_ROOM_ALIASES;
window.resolveCanonicalRoom = resolveCanonicalRoom;

function computeOceanGatePlane(vertices, ogExitInfo) {
    const n = vertices.length;
    const center = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        center[0] += vertices[i][0] / n;
        center[1] += vertices[i][1] / n;
        center[2] += vertices[i][2] / n;
    }

    const v0 = vertices[0], v1 = vertices[1], v2 = vertices[2];
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    let nLen = Math.hypot(nx, ny, nz);

    if (nLen < 1e-6 && vertices.length > 3) {
        const v3 = vertices[3];
        const e3 = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];
        nx = e1[1] * e3[2] - e1[2] * e3[1];
        ny = e1[2] * e3[0] - e1[0] * e3[2];
        nz = e1[0] * e3[1] - e1[1] * e3[0];
        nLen = Math.hypot(nx, ny, nz);
    }
    if (nLen < 1e-6) {
        nx = 0; ny = 0; nz = 1; nLen = 1;
    }

    const normal = [nx / nLen, ny / nLen, nz / nLen];
    const e1Len = Math.hypot(e1[0], e1[1], e1[2]) || 1.0;
    const uAxis = [e1[0] / e1Len, e1[1] / e1Len, e1[2] / e1Len];
    const vAxis = [
        normal[1] * uAxis[2] - normal[2] * uAxis[1],
        normal[2] * uAxis[0] - normal[0] * uAxis[2],
        normal[0] * uAxis[1] - normal[1] * uAxis[0]
    ];
    const vLen = Math.hypot(vAxis[0], vAxis[1], vAxis[2]) || 1.0;
    vAxis[0] /= vLen; vAxis[1] /= vLen; vAxis[2] /= vLen;

    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < n; i++) {
        const dx = vertices[i][0] - center[0];
        const dy = vertices[i][1] - center[1];
        const dz = vertices[i][2] - center[2];
        const u = dx * uAxis[0] + dy * uAxis[1] + dz * uAxis[2];
        const v = dx * vAxis[0] + dy * vAxis[1] + dz * vAxis[2];
        if (u < uMin) uMin = u; if (u > uMax) uMax = u;
        if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }

    return {
        name: ogExitInfo.name,
        targetDimension: ogExitInfo.targetDimension,
        targetRoom: ogExitInfo.targetRoom,
        center: center,
        normal: normal,
        uAxis: uAxis,
        vAxis: vAxis,
        uMin: uMin,
        uMax: uMax,
        vMin: vMin,
        vMax: vMax,
        proximity: 0.5,
        vertices: vertices
    };
}

function distanceToOceanGatePlane(point, plane) {
    if (!plane) return 999.0;
    const dx = point[0] - plane.center[0];
    const dy = point[1] - plane.center[1];
    const dz = point[2] - plane.center[2];

    const u = dx * plane.uAxis[0] + dy * plane.uAxis[1] + dz * plane.uAxis[2];
    const v = dx * plane.vAxis[0] + dy * plane.vAxis[1] + dz * plane.vAxis[2];
    const dPlane = dx * plane.normal[0] + dy * plane.normal[1] + dz * plane.normal[2];

    const cu = Math.max(plane.uMin, Math.min(plane.uMax, u));
    const cv = Math.max(plane.vMin, Math.min(plane.vMax, v));

    const diffU = cu - u;
    const diffV = cv - v;
    return Math.hypot(diffU, diffV, dPlane);
}
window.distanceToOceanGatePlane = distanceToOceanGatePlane;
window.computeOceanGatePlane = computeOceanGatePlane;

function buildTriangleMeta(cpuTriangles, cpuTriProperties = null) {
    const len = cpuTriangles.length;
    const meta = new Array(len);
    for (let i = 0; i < len; i++) {
        const tri = cpuTriangles[i];
        const a = tri[0], b = tri[1], c = tri[2];
        const ax = a[0], ay = a[1], az = a[2];
        const bx = b[0], by = b[1], bz = b[2];
        const cx = c[0], cy = c[1], cz = c[2];

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        if (ny < 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
        }
        const nLen = Math.hypot(nx, ny, nz) || 1.0;
        const normX = nx / nLen;
        const normY = ny / nLen;
        const normZ = nz / nLen;

        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const invDet = Math.abs(det) >= 1e-6 ? (1.0 / det) : 0.0;

        const prop = (cpuTriProperties && cpuTriProperties[i]) ? cpuTriProperties[i] : null;

        meta[i] = {
            minX: Math.min(ax, bx, cx),
            maxX: Math.max(ax, bx, cx),
            minY: Math.min(ay, by, cy),
            maxY: Math.max(ay, by, cy),
            minZ: Math.min(az, bz, cz),
            maxZ: Math.max(az, bz, cz),
            e1x, e1y, e1z,
            e2x, e2y, e2z,
            normal: [normX, normY, normZ],
            ny: normY,
            invDet,
            isCoastal: prop ? Boolean(prop.isCoastal) : false,
            isObstacleProp: prop ? Boolean(prop.isObstacleProp) : false,
            materialName: prop ? (prop.materialName || '') : '',
            nodeName: prop ? (prop.nodeName || '') : '',
            meshName: prop ? (prop.meshName || '') : ''
        };
    }
    return meta;
}

class SpatialGrid {
    constructor(cellSize = 4.0) {
        this.cellSize = cellSize;
        this.grid = new Map();
        this._queryStamp = 0;
        this._seenStamp = null;
        this._queryResult = [];
    }

    _key(cx, cz) {
        return `${cx},${cz}`;
    }

    insert(triIndex, pA, pB, pC) {
        const minX = Math.floor(Math.min(pA[0], pB[0], pC[0]) / this.cellSize);
        const maxX = Math.floor(Math.max(pA[0], pB[0], pC[0]) / this.cellSize);
        const minZ = Math.floor(Math.min(pA[2], pB[2], pC[2]) / this.cellSize);
        const maxZ = Math.floor(Math.max(pA[2], pB[2], pC[2]) / this.cellSize);

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cz = minZ; cz <= maxZ; cz++) {
                const key = this._key(cx, cz);
                if (!this.grid.has(key)) {
                    this.grid.set(key, []);
                }
                this.grid.get(key).push(triIndex);
            }
        }
    }

    getTrianglesAt(x, z) {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return this.grid.get(this._key(cx, cz)) || EMPTY_TRI_LIST;
    }

    getTrianglesInAABB(minX, maxX, minZ, maxZ, totalTriangles = 0) {
        const cxMin = Math.floor(minX / this.cellSize);
        const cxMax = Math.floor(maxX / this.cellSize);
        const czMin = Math.floor(minZ / this.cellSize);
        const czMax = Math.floor(maxZ / this.cellSize);

        if (cxMin === cxMax && czMin === czMax) {
            return this.grid.get(this._key(cxMin, czMin)) || EMPTY_TRI_LIST;
        }

        if (!this._seenStamp || (totalTriangles > 0 && this._seenStamp.length < totalTriangles)) {
            this._seenStamp = new Int32Array(Math.max(totalTriangles, 4096));
            this._queryStamp = 0;
        }

        const stamp = ++this._queryStamp;
        const seen = this._seenStamp;
        const out = this._queryResult;
        out.length = 0;

        for (let cx = cxMin; cx <= cxMax; cx++) {
            for (let cz = czMin; cz <= czMax; cz++) {
                const bucket = this.grid.get(this._key(cx, cz));
                if (!bucket) continue;
                for (let i = 0, len = bucket.length; i < len; i++) {
                    const idx = bucket[i];
                    if (seen[idx] !== stamp) {
                        seen[idx] = stamp;
                        out.push(idx);
                    }
                }
            }
        }
        return out;
    }
}

class SubModel {
    constructor(gl, primitives, cpuTriangles, defaultTexture) {
        this.gl = gl;
        this.primitives = primitives;
        this.cpuTriangles = cpuTriangles;
        this.cpuTriMeta = buildTriangleMeta(cpuTriangles);
        this.defaultTexture = defaultTexture;
        this.spatialGrid = new SpatialGrid(4.0);
        for (let i = 0; i < this.cpuTriangles.length; i++) {
            const tri = this.cpuTriangles[i];
            this.spatialGrid.insert(i, tri[0], tri[1], tri[2]);
        }
    }

    draw(locations, parentTransformMatrix = null, isDynamic = false) {
        const gl = this.gl;
        let currentlyBoundVAO = null;
        let currentlyBoundTexture = null;

        for (const prim of this.primitives) {
            if (currentlyBoundVAO !== prim.vao) {
                gl.bindVertexArray(prim.vao);
                currentlyBoundVAO = prim.vao;
            }

            if (parentTransformMatrix) {
                gl.uniformMatrix4fv(locations.u_modelMatrix, false, parentTransformMatrix);
            } else {
                gl.uniformMatrix4fv(locations.u_modelMatrix, false, prim.nodeMatrix);
            }

            const activeTex = prim.texture || this.defaultTexture;
            if (currentlyBoundTexture !== activeTex) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, activeTex);
                currentlyBoundTexture = activeTex;
            }

            gl.uniform1i(locations.u_texture, 0);
            gl.uniform1i(locations.u_useTexture, prim.texture ? 1 : 0);

            if (prim.indexCount > 0) {
                gl.drawElements(prim.mode, prim.indexCount, prim.indexComponentType, 0);
            }
        }

        gl.bindVertexArray(null);
    }
}

class GLTFModel {
    constructor(gl) {
        this.gl = gl;
        this.primitives = [];
        this.cpuTriangles = [];
        this.cpuTriProperties = [];
        this.textures = [];
        this.defaultTexture = this.createSolidTexture(gl, [1.0, 1.0, 1.0, 1.0]);
        this.spatialGrid = null;

        this.entrances = {};
        this.entranceList = [];
        this.exits = [];
        this.oceanGateExits = [];
        this.pickups = []; // Stores extracted SubModel instances
    }

    createSolidTexture(gl, colorArray = [1.0, 1.0, 1.0, 1.0]) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const pixel = new Uint8Array([
            Math.round((colorArray[0] ?? 1.0) * 255),
            Math.round((colorArray[1] ?? 1.0) * 255),
            Math.round((colorArray[2] ?? 1.0) * 255),
            Math.round((colorArray[3] ?? 1.0) * 255)
        ]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return tex;
    }

    async load(url) {
        const gl = this.gl;
        const response = await fetch(url);
        const gltf = await response.json();

        this.entrances = {};
        this.entranceList = [];
        this.exits = [];
        this.oceanGateExits = [];
        this.pickups = [];
        this.primitives = [];
        this.cpuTriangles = [];
        this.cpuTriProperties = [];

        const buffers = await Promise.all(gltf.buffers.map(async (b) => {
            const bufferUrl = (typeof window.resolveUrl === 'function')
                ? window.resolveUrl(b.uri, url)
                : b.uri;

            console.log(`[glTF Buffer Load] Requesting '${b.uri}' -> Resolved: '${bufferUrl}'`);

            const res = await fetch(bufferUrl);
            if (!res.ok) {
                throw new Error(`Failed to fetch glTF buffer '${b.uri}' at '${bufferUrl}' (Status ${res.status})`);
            }
            return await res.arrayBuffer();
        }));

        if (gltf.images) {
            this.textures = await Promise.all(gltf.images.map(async (imgDef) => {
                let img = new Image();
                img.crossOrigin = "anonymous";
                
                if (imgDef.uri) {
                    const imgUrl = (typeof window.resolveUrl === 'function')
                        ? window.resolveUrl(imgDef.uri, url)
                        : imgDef.uri;
                    img.src = imgUrl;
                } else if (imgDef.bufferView !== undefined) {
                    const bv = gltf.bufferViews[imgDef.bufferView];
                    const blob = new Blob([new Uint8Array(buffers[bv.buffer], bv.byteOffset || 0, bv.byteLength)], { type: imgDef.mimeType });
                    img.src = URL.createObjectURL(blob);
                }

                await new Promise((resolve) => { img.onload = resolve; });

                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

                return tex;
            }));
        }

        const pickupNodesMap = new Map();
        const oceanGateExitNodesMap = new Map();

        if (gltf.nodes) {
            gltf.nodes.forEach((node, nodeIdx) => {
                if (!node.name) return;

                const rawTrans = node.translation || [0, 0, 0];
                const translation = [rawTrans[0], rawTrans[1], rawTrans[2]];
                let rotationY = 0.0;

                if (node.rotation) {
                    const [qx, qy, qz, qw] = node.rotation;
                    rotationY = Math.atan2(2.0 * (qw * qy + qx * qz), 1.0 - 2.0 * (qy * qy + qz * qz));
                }

                // Ocean Gate regexes (matches og_en__world, og_en_l__world, og_ex__world, og_ex_l__world):
                const ogEntranceMatch = node.name.match(/^og_en(?:_([lds]))?__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/);
                const ogExitMatch     = node.name.match(/^og_ex(?:_([lds]))?__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/);

                // Dimensional prefix regexes:
                // match[1] = dimension ('l', 'd', 's')
                // match[2] = room or sub-room path (supports directory / parameter syntax)
                const dimEntranceMatch = node.name.match(/^en_([lds])__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/);
                const dimExitMatch     = node.name.match(/^ex_([lds])__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/);

                // Bar External Exit regexes (supports bar_ex__<target>, bar_ex_l__<target>, bar_ex_d__<target>, bar_ex_s__<target>):
                const barExitMatch     = node.name.match(/^bar_ex(?:_([lds]))?__(.+?)(?:\.\d{3})?$/);

                // Fallback legacy regexes (assumes light world if unspecified):
                const legacyEntranceMatch = node.name.match(/^en__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/);
                const legacyExitMatch     = node.name.match(/^ex__([a-zA-Z0-9_\/:\.\-]+?)(?:\.\d{3})?$/);
                const pickupMatch         = node.name.match(/^pk__([a-zA-Z0-9_]+?)(?:\.\d{3})?$/);

                if (ogEntranceMatch) {
                    const targetDim = ogEntranceMatch[1] || 'l';
                    const originRoom = ogEntranceMatch[2];
                    const entranceData = {
                        name: node.name,
                        dimension: targetDim,
                        room: originRoom,
                        position: translation,
                        rotationY: rotationY,
                        isOceanGate: true
                    };
                    this.entrances[`og_en__${originRoom}`] = entranceData;
                    this.entrances[`og_en_${targetDim}__${originRoom}`] = entranceData;
                    this.entrances[`og__${originRoom}`] = entranceData;
                    this.entrances[originRoom] = entranceData;
                    this.entrances[node.name] = entranceData;

                } else if (ogExitMatch) {
                    const targetDim = ogExitMatch[1] || 'l';
                    const targetRoom = resolveCanonicalRoom(ogExitMatch[2]);
                    oceanGateExitNodesMap.set(nodeIdx, {
                        name: node.name,
                        targetDimension: targetDim,
                        targetRoom: targetRoom,
                        position: translation,
                        rotationY: rotationY
                    });

                } else if (dimEntranceMatch) {
                    const targetDim = dimEntranceMatch[1]; // 'l', 'd', 's'
                    const originRoom = dimEntranceMatch[2];
                    const canonicalOrigin = resolveCanonicalRoom(originRoom);
                    const entranceData = {
                        name: node.name,
                        dimension: targetDim,
                        room: canonicalOrigin,
                        position: translation,
                        rotationY: rotationY
                    };
                    this.entranceList.push(entranceData);
                    this.entrances[`${targetDim}__${originRoom}`] = entranceData;
                    this.entrances[originRoom] = entranceData;
                    this.entrances[`${targetDim}__${canonicalOrigin}`] = entranceData;
                    this.entrances[canonicalOrigin] = entranceData;
                    this.entrances[node.name] = entranceData;

                    // Also register reverse aliases
                    const aliases = REVERSE_ROOM_ALIASES[canonicalOrigin] || [];
                    for (const a of aliases) {
                        this.entrances[a] = entranceData;
                        this.entrances[`${targetDim}__${a}`] = entranceData;
                    }

                    // Sub-room & Decoupled Hyperlink address matching
                    // Supports directory syntax (e.g. en_l__temple/foyer or en_l__temple__foyer)
                    const subParts = originRoom.includes('/')
                        ? originRoom.split('/')
                        : (originRoom.includes('__') ? originRoom.split('__') : null);

                    if (subParts && subParts.length > 1) {
                        const parentPath = subParts.slice(0, -1).join('/');
                        const parentUnderscore = subParts.slice(0, -1).join('__');
                        const subName = subParts[subParts.length - 1];

                        this.entrances[subName] = entranceData;
                        this.entrances[`${parentPath}/${subName}`] = entranceData;
                        this.entrances[`${parentUnderscore}__${subName}`] = entranceData;
                        this.entrances[`${targetDim}__${subName}`] = entranceData;
                        this.entrances[`${targetDim}__${parentPath}/${subName}`] = entranceData;
                        this.entrances[`${targetDim}__${parentUnderscore}__${subName}`] = entranceData;

                        if (subName === 'default') {
                            this.entrances[parentPath] = entranceData;
                            this.entrances[parentUnderscore] = entranceData;
                            this.entrances['default'] = entranceData;
                        }
                    }

                } else if (barExitMatch) {
                    const targetDim = barExitMatch[1] || 'l';
                    let rawTarget = barExitMatch[2];
                    let decodedTarget = rawTarget
                        .replace(/^https___/i, 'https://')
                        .replace(/^http___/i, 'http://')
                        .replace(/^bar___/i, 'bar://')
                        .replace(/ /g, '%20');
                    if (!decodedTarget.startsWith('http://') && !decodedTarget.startsWith('https://') && (decodedTarget.includes('.com') || decodedTarget.includes('.bar') || decodedTarget.includes('.net') || decodedTarget.includes('.org') || decodedTarget.includes(':'))) {
                        decodedTarget = 'https://' + decodedTarget;
                    }
                    this.exits.push({
                        name: node.name,
                        targetDimension: targetDim,
                        targetRoom: decodedTarget,
                        isBarExternal: true,
                        externalUrl: decodedTarget,
                        position: translation,
                        rotationY: rotationY
                    });

                } else if (dimExitMatch) {
                    const targetDim = dimExitMatch[1]; // 'l', 'd', 's'
                    const targetRoom = resolveCanonicalRoom(dimExitMatch[2]);
                    this.exits.push({
                        name: node.name,
                        targetDimension: targetDim, // 'l', 'd', 's'
                        targetRoom: targetRoom,
                        position: translation,
                        rotationY: rotationY
                    });

                } else if (legacyEntranceMatch) {
                    const originRoom = legacyEntranceMatch[1];
                    const canonicalOrigin = resolveCanonicalRoom(originRoom);
                    const entranceData = {
                        name: node.name,
                        dimension: 'l',
                        room: canonicalOrigin,
                        position: translation,
                        rotationY: rotationY
                    };
                    this.entranceList.push(entranceData);
                    this.entrances[originRoom] = entranceData;
                    this.entrances[canonicalOrigin] = entranceData;
                    this.entrances[node.name] = entranceData;

                    const aliases = REVERSE_ROOM_ALIASES[canonicalOrigin] || [];
                    for (const a of aliases) {
                        this.entrances[a] = entranceData;
                    }

                    const subParts = originRoom.includes('/')
                        ? originRoom.split('/')
                        : (originRoom.includes('__') ? originRoom.split('__') : null);

                    if (subParts && subParts.length > 1) {
                        const parentPath = subParts.slice(0, -1).join('/');
                        const parentUnderscore = subParts.slice(0, -1).join('__');
                        const subName = subParts[subParts.length - 1];

                        this.entrances[subName] = entranceData;
                        this.entrances[`${parentPath}/${subName}`] = entranceData;
                        this.entrances[`${parentUnderscore}__${subName}`] = entranceData;

                        if (subName === 'default') {
                            this.entrances[parentPath] = entranceData;
                            this.entrances[parentUnderscore] = entranceData;
                            this.entrances['default'] = entranceData;
                        }
                    }

                } else if (legacyExitMatch) {
                    const rawTarget = legacyExitMatch[1];
                    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('https___') || rawTarget.startsWith('http___') || rawTarget.startsWith('bar://')) {
                        let decodedTarget = rawTarget
                            .replace(/^https___/i, 'https://')
                            .replace(/^http___/i, 'http://')
                            .replace(/ /g, '%20');
                        this.exits.push({
                            name: node.name,
                            targetDimension: 'l',
                            targetRoom: decodedTarget,
                            isBarExternal: true,
                            externalUrl: decodedTarget,
                            position: translation,
                            rotationY: rotationY
                        });
                    } else {
                        const targetRoom = resolveCanonicalRoom(rawTarget);
                        this.exits.push({ name: node.name, targetDimension: 'l', targetRoom: targetRoom, position: translation, rotationY: rotationY });
                    }

                } else if (pickupMatch) {
                    const cleanItemType = pickupMatch[1];
                    pickupNodesMap.set(nodeIdx, { name: cleanItemType, rawNodeName: node.name, position: translation, rotationY: rotationY });
                }
            });
        }

        const getBufferData = (accessorIndex) => {
            const accessor = gltf.accessors[accessorIndex];
            const bufferView = gltf.bufferViews[accessor.bufferView];
            const rawBuffer = buffers[bufferView.buffer];
            const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
            return { accessor, bufferView, rawBuffer, byteOffset };
        };

        const processNode = (nodeIndex, parentMatrix = null) => {
            const node = gltf.nodes[nodeIndex];
            if (!node) return;

            const isPickupNode = pickupNodesMap.has(nodeIndex);
            const pickupInfo = isPickupNode ? pickupNodesMap.get(nodeIndex) : null;
            const isOceanGateExit = oceanGateExitNodesMap.has(nodeIndex);
            const ogExitInfo = isOceanGateExit ? oceanGateExitNodesMap.get(nodeIndex) : null;

            const nodeMat = Mat4.create();

            if (node.matrix) {
                for (let i = 0; i < 16; i++) nodeMat[i] = node.matrix[i];
            } else {
                const t = node.translation || [0, 0, 0];
                const r = node.rotation || [0, 0, 0, 1];
                const s = node.scale || [1, 1, 1];

                const qx = r[0], qy = r[1], qz = r[2], qw = r[3];
                const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
                const xx = qx * x2, xy = qx * y2, xz = qx * z2;
                const yy = qy * y2, yz = qy * z2, zz = qz * z2;
                const wx = qw * x2, wy = qw * y2, wz = qw * z2;

                nodeMat[0] = (1 - (yy + zz)) * s[0];
                nodeMat[1] = (xy + wz) * s[0];
                nodeMat[2] = (xz - wy) * s[0];
                nodeMat[3] = 0;

                nodeMat[4] = (xy - wz) * s[1];
                nodeMat[5] = (1 - (xx + zz)) * s[1];
                nodeMat[6] = (yz + wx) * s[1];
                nodeMat[7] = 0;

                nodeMat[8] = (xz + wy) * s[2];
                nodeMat[9] = (yz - wx) * s[2];
                nodeMat[10] = (1 - (xx + yy)) * s[2];
                nodeMat[11] = 0;

                nodeMat[12] = t[0];
                nodeMat[13] = t[1];
                nodeMat[14] = t[2];
                nodeMat[15] = 1;
            }

            const worldNodeMat = Mat4.create();
            if (parentMatrix) {
                multiplyMat4(worldNodeMat, parentMatrix, nodeMat);
            } else {
                for (let i = 0; i < 16; i++) worldNodeMat[i] = nodeMat[i];
            }

            const pickupPrimitives = [];
            const pickupTriangles = [];

            if (node.mesh !== undefined && gltf.meshes[node.mesh]) {
                const mesh = gltf.meshes[node.mesh];
                const nodeName = node.name || '';
                const meshName = mesh.name || '';
                const isCoastal = nodeName.startsWith('ca__') || meshName.startsWith('ca__');

                if (isOceanGateExit) {
                    // og_ex__ plane exit: invisible and intangible, used solely for calculating exit plane
                    const ogWorldVerts = [];
                    for (const primitive of mesh.primitives) {
                        const posData = getBufferData(primitive.attributes.POSITION);
                        const positions = new Float32Array(posData.rawBuffer, posData.byteOffset, posData.accessor.count * 3);
                        for (let i = 0; i < posData.accessor.count; i++) {
                            const localV = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
                            ogWorldVerts.push(transformVec3(localV, worldNodeMat));
                        }
                    }
                    if (ogWorldVerts.length >= 3) {
                        const planeData = computeOceanGatePlane(ogWorldVerts, ogExitInfo);
                        this.oceanGateExits.push(planeData);
                        this.exits.push({
                            name: ogExitInfo.name,
                            targetDimension: ogExitInfo.targetDimension,
                            targetRoom: ogExitInfo.targetRoom,
                            position: planeData.center,
                            rotationY: ogExitInfo.rotationY,
                            isOceanGate: true,
                            planeData: planeData
                        });
                        console.log(`[glTF Ocean Gate] Extracted plane exit '${ogExitInfo.name}' -> '${ogExitInfo.targetRoom}' (Center: ${planeData.center.map(v => v.toFixed(2)).join(', ')})`);
                    }
                } else {
                    for (const primitive of mesh.primitives) {
                        const posData = getBufferData(primitive.attributes.POSITION);
                        const positions = new Float32Array(posData.rawBuffer, posData.byteOffset, posData.accessor.count * 3);

                        let indices = null;
                        if (primitive.indices !== undefined) {
                            const idxData = getBufferData(primitive.indices);
                            const TypedArray = idxData.accessor.componentType === 5123 ? Uint16Array : Uint32Array;
                            indices = new TypedArray(idxData.rawBuffer, idxData.byteOffset, idxData.accessor.count);
                        }

                        const tempTriangles = [];
                        if (indices) {
                            for (let i = 0; i < indices.length; i += 3) {
                                const i0 = indices[i] * 3, i1 = indices[i+1] * 3, i2 = indices[i+2] * 3;
                                
                                // If pickup node, orient relative to origin (local center)
                                const localMat = isPickupNode ? Mat4.create() : worldNodeMat;
                                const v0 = transformVec3([positions[i0], positions[i0+1], positions[i0+2]], localMat);
                                const v1 = transformVec3([positions[i1], positions[i1+1], positions[i1+2]], localMat);
                                const v2 = transformVec3([positions[i2], positions[i2+1], positions[i2+2]], localMat);

                                tempTriangles.push([v0, v1, v2]);
                            }
                        }

                        const vao = gl.createVertexArray();
                        gl.bindVertexArray(vao);

                        const setupAttribute = (location, accessorIndex) => {
                            if (accessorIndex === undefined || location === -1) return false;
                            const { accessor, rawBuffer, byteOffset } = getBufferData(accessorIndex);
                            
                            const vbo = gl.createBuffer();
                            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                            gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(rawBuffer, byteOffset, accessor.count * getElementSize(accessor)), gl.STATIC_DRAW);
                            
                            const numComponents = getComponentCount(accessor.type);
                            gl.enableVertexAttribArray(location);
                            gl.vertexAttribPointer(location, numComponents, accessor.componentType, accessor.normalized || false, 0, 0);
                            return true;
                        };

                        setupAttribute(0, primitive.attributes.POSITION);
                        setupAttribute(1, primitive.attributes.NORMAL);
                        const hasUVs = setupAttribute(2, primitive.attributes.TEXCOORD_0);

                        let indexCount = 0;
                        let indexComponentType = 0;
                        if (primitive.indices !== undefined) {
                            const { accessor, rawBuffer, byteOffset } = getBufferData(primitive.indices);
                            indexCount = accessor.count;
                            indexComponentType = accessor.componentType;

                            const ibo = gl.createBuffer();
                            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
                            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(rawBuffer, byteOffset, accessor.count * getElementSize(accessor)), gl.STATIC_DRAW);
                        }

                        gl.bindVertexArray(null);

                        let texture = null;
                        if (primitive.material !== undefined && gltf.materials) {
                            const mat = gltf.materials[primitive.material];
                            if (mat && mat.pbrMetallicRoughness) {
                                const pbr = mat.pbrMetallicRoughness;
                                if (pbr.baseColorTexture) {
                                    const texIndex = pbr.baseColorTexture.index;
                                    const imageIndex = gltf.textures[texIndex].source;
                                    texture = this.textures[imageIndex];
                                } else if (pbr.baseColorFactor) {
                                    texture = this.createSolidTexture(gl, pbr.baseColorFactor);
                                }
                            }
                        }

                        const primObj = {
                            vao,
                            indexCount,
                            indexComponentType,
                            hasUVs,
                            nodeMatrix: worldNodeMat,
                            baseNodeMatrix: new Float32Array(worldNodeMat),
                            nodeName: nodeName,
                            texture: texture || this.defaultTexture,
                            mode: primitive.mode !== undefined ? primitive.mode : gl.TRIANGLES
                        };

                        const matName = (primitive.material !== undefined && gltf.materials && gltf.materials[primitive.material]) ? (gltf.materials[primitive.material].name || '') : '';
                        const primIsCoastal = isCoastal || matName.toLowerCase().includes('ocean') || matName.toLowerCase().includes('water') || matName.startsWith('ca__');

                        if (isPickupNode) {
                            pickupPrimitives.push(primObj);
                            pickupTriangles.push(...tempTriangles);
                        } else {
                            this.primitives.push(primObj);
                            if (!this.primitivesByNode) this.primitivesByNode = new Map();
                            if (!this.primitivesByNode.has(nodeName)) this.primitivesByNode.set(nodeName, []);
                            this.primitivesByNode.get(nodeName).push(primObj);

                            this.cpuTriTriangles = this.cpuTriTriangles || [];
                            const matLower = matName.toLowerCase();
                            const nodeLower = nodeName.toLowerCase();
                            // Do not treat architectural timber, decks, or terraces as obstacle props
                            const isObstacleProp = matLower.includes('fence') ||
                                                   matLower.includes('rail') ||
                                                   matLower.includes('barrier') ||
                                                   matLower.includes('sign') ||
                                                   matLower.includes('lantern') ||
                                                   matLower.includes('torch') ||
                                                   matLower.includes('trunk') ||
                                                   matLower.includes('foliage') ||
                                                   nodeLower.includes('fence') ||
                                                   nodeLower.includes('rail');

                            this.cpuTriangles.push(...tempTriangles);
                            for (let k = 0; k < tempTriangles.length; k++) {
                                this.cpuTriProperties.push({
                                    nodeName: nodeName,
                                    meshName: meshName,
                                    materialName: matName,
                                    isCoastal: Boolean(primIsCoastal),
                                    isObstacleProp: Boolean(isObstacleProp)
                                });
                            }
                        }
                    }
                }
            } else if (isOceanGateExit) {
                // og_ex__ plane exit without mesh: synthesize default vertical plane centered on node
                const px = worldNodeMat[12], py = worldNodeMat[13], pz = worldNodeMat[14];
                const ogWorldVerts = [
                    [px - 8.0, py - 2.0, pz],
                    [px + 8.0, py - 2.0, pz],
                    [px + 8.0, py + 8.0, pz],
                    [px - 8.0, py + 8.0, pz]
                ];
                const planeData = computeOceanGatePlane(ogWorldVerts, ogExitInfo);
                this.oceanGateExits.push(planeData);
                this.exits.push({
                    name: ogExitInfo.name,
                    targetDimension: ogExitInfo.targetDimension,
                    targetRoom: ogExitInfo.targetRoom,
                    position: planeData.center,
                    rotationY: ogExitInfo.rotationY,
                    isOceanGate: true,
                    planeData: planeData
                });
                console.log(`[glTF Ocean Gate] Extracted empty-node plane exit '${ogExitInfo.name}' -> '${ogExitInfo.targetRoom}' (Center: ${planeData.center.map(v => v.toFixed(2)).join(', ')})`);
            }

            if (isPickupNode) {
                const standaloneModel = new SubModel(gl, pickupPrimitives, pickupTriangles, this.defaultTexture);
                this.pickups.push({
                    name: pickupInfo.name,
                    position: pickupInfo.position,
                    rotationY: pickupInfo.rotationY !== undefined ? pickupInfo.rotationY : 0.0,
                    model: standaloneModel
                });
            }

            if (node.children) {
                for (const childIndex of node.children) {
                    processNode(childIndex, worldNodeMat);
                }
            }
        };

        if (gltf.scenes && gltf.scenes[gltf.scene || 0]) {
            const scene = gltf.scenes[gltf.scene || 0];
            for (const rootNodeIndex of scene.nodes) {
                processNode(rootNodeIndex, null);
            }
        } else if (gltf.nodes) {
            for (let i = 0; i < gltf.nodes.length; i++) {
                processNode(i, null);
            }
        }

        this.cpuTriMeta = buildTriangleMeta(this.cpuTriangles, this.cpuTriProperties);
        this.spatialGrid = new SpatialGrid(4.0);
        for (let i = 0; i < this.cpuTriangles.length; i++) {
            const tri = this.cpuTriangles[i];
            this.spatialGrid.insert(i, tri[0], tri[1], tri[2]);
        }

        if (this.primitivesByNode && this.primitivesByNode.has('torso')) {
            this.attachEgoWings(gl);
        }

        this.isLoaded = true;
    }

    attachWingModel(wingsModel) {
        if (!wingsModel || !wingsModel.primitives) return;
        if (this.primitivesByNode && this.primitivesByNode.has('ego_wing_left')) return;

        for (let i = 0; i < wingsModel.primitives.length; i++) {
            const prim = wingsModel.primitives[i];
            const zeroMat = new Float32Array(16);
            const primClone = {
                vao: prim.vao,
                indexCount: prim.indexCount,
                indexComponentType: prim.indexComponentType,
                hasUVs: prim.hasUVs,
                nodeMatrix: zeroMat,
                baseNodeMatrix: new Float32Array(16),
                nodeName: prim.nodeName,
                texture: prim.texture,
                mode: prim.mode
            };
            this.primitives.push(primClone);
            if (!this.primitivesByNode) this.primitivesByNode = new Map();
            if (!this.primitivesByNode.has(prim.nodeName)) {
                this.primitivesByNode.set(prim.nodeName, []);
            }
            this.primitivesByNode.get(prim.nodeName).push(primClone);
        }
    }

    attachEgoWings(gl) {
        // Wings are now stored and loaded as a 3D model (ego_wings.gltf)
        return;
    }

    draw(locations, parentTransformMatrix = null, isDynamic = false) {
        const gl = this.gl;
        let currentlyBoundVAO = null;
        let currentlyBoundTexture = null;
        const isIdentityParent = !parentTransformMatrix || (
            !isDynamic &&
            parentTransformMatrix[0] === 1 && parentTransformMatrix[5] === 1 && parentTransformMatrix[10] === 1 &&
            parentTransformMatrix[12] === 0 && parentTransformMatrix[13] === 0 && parentTransformMatrix[14] === 0
        );

        for (let i = 0, len = this.primitives.length; i < len; i++) {
            const prim = this.primitives[i];
            if (currentlyBoundVAO !== prim.vao) {
                gl.bindVertexArray(prim.vao);
                currentlyBoundVAO = prim.vao;
            }
            
            if (isIdentityParent) {
                gl.uniformMatrix4fv(locations.u_modelMatrix, false, prim.nodeMatrix);
            } else {
                multiplyMat4(SCRATCH_COMBINED_MAT, parentTransformMatrix, prim.nodeMatrix);
                gl.uniformMatrix4fv(locations.u_modelMatrix, false, SCRATCH_COMBINED_MAT);
            }

            const activeTex = prim.texture || this.defaultTexture;
            if (currentlyBoundTexture !== activeTex) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, activeTex);
                currentlyBoundTexture = activeTex;
            }

            gl.uniform1i(locations.u_texture, 0);
            gl.uniform1i(locations.u_useTexture, prim.texture ? 1 : 0);

            if (prim.indexCount > 0) {
                gl.drawElements(prim.mode, prim.indexCount, prim.indexComponentType, 0);
            }
        }

        gl.bindVertexArray(null);
    }

    createInstance() {
        const inst = new GLTFModel(this.gl);
        inst.textures = this.textures;
        inst.defaultTexture = this.defaultTexture;
        inst.cpuTriangles = this.cpuTriangles;
        inst.cpuTriProperties = this.cpuTriProperties;
        inst.cpuTriMeta = this.cpuTriMeta;
        inst.spatialGrid = this.spatialGrid;
        inst.entrances = this.entrances;
        inst.entranceList = this.entranceList;
        inst.exits = this.exits;
        inst.oceanGateExits = this.oceanGateExits;
        inst.pickups = this.pickups;
        inst.primitives = [];
        inst.primitivesByNode = new Map();

        for (let i = 0, len = this.primitives.length; i < len; i++) {
            const p = this.primitives[i];
            const baseMat = p.baseNodeMatrix || p.nodeMatrix;
            const newPrim = {
                vao: p.vao,
                indexCount: p.indexCount,
                indexComponentType: p.indexComponentType,
                hasUVs: p.hasUVs,
                nodeMatrix: new Float32Array(baseMat),
                baseNodeMatrix: p.baseNodeMatrix ? new Float32Array(p.baseNodeMatrix) : new Float32Array(baseMat),
                nodeName: p.nodeName,
                texture: p.texture,
                mode: p.mode
            };
            inst.primitives.push(newPrim);
            if (!inst.primitivesByNode.has(newPrim.nodeName)) {
                inst.primitivesByNode.set(newPrim.nodeName, []);
            }
            inst.primitivesByNode.get(newPrim.nodeName).push(newPrim);
        }
        inst.isLoaded = true;
        return inst;
    }
}

const WALL_ANGLES_COS = [1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2, 0, Math.SQRT1_2];
const WALL_ANGLES_SIN = [0, Math.SQRT1_2, 1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2];
const MAX_SLOPE_COS_62 = Math.cos(62.0 * Math.PI / 180.0);
const SCRATCH_LOCAL_WALL_TRIS = [];

class GameObject {
    constructor(model, color = [1.0, 1.0, 1.0], isUnlit = false, isDynamic = false) {
        this.model = model;
        this.color = color;
        this.isUnlit = isUnlit;
        this.isDynamic = isDynamic;
        this.position = [0, 0, 0];
        this.rotationY = 0;
        this.scale = [1, 1, 1];
        this.transformMatrix = Mat4.create();

        this.visible = true;
        this.isInteractable = false;
        this.name = "OBJECT";
        this._groundHitResult = { heightY: 0, normal: null, triIndex: -1, isCoastal: false, nodeName: '', meshName: '' };
    }

    updateMatrix() {
        const m = this.transformMatrix;
        const cos = Math.cos(this.rotationY);
        const sin = Math.sin(this.rotationY);

        m[0] = cos * this.scale[0];
        m[2] = -sin * this.scale[2];
        m[5] = this.scale[1];
        m[8] = sin * this.scale[0];
        m[10] = cos * this.scale[2];

        m[12] = this.position[0];
        m[13] = this.position[1];
        m[14] = this.position[2];
        m[15] = 1.0;
    }

    getGroundHeight(x, z, currentY = 0, maxStepUp = 0.35, maxStepDown = 5.0) {
        const triData = this.getGroundTriangle(x, z, currentY, maxStepUp, maxStepDown);
        return triData ? triData.heightY : null;
    }

    getGroundTriangle(x, z, currentY = 0, maxStepUp = 0.35, maxStepDown = 500.0) {
        const model = this.model;
        if (!model || !model.cpuTriangles || model.cpuTriangles.length === 0) return null;
        if (!model.cpuTriMeta) model.cpuTriMeta = buildTriangleMeta(model.cpuTriangles);

        const posX = this.position[0], posY = this.position[1], posZ = this.position[2];
        const scaleX = this.scale[0], scaleY = this.scale[1], scaleZ = this.scale[2];
        const isIdentity = (posX === 0 && posY === 0 && posZ === 0 && scaleX === 1 && scaleY === 1 && scaleZ === 1);

        const localX = isIdentity ? x : (x - posX) / scaleX;
        const localZ = isIdentity ? z : (z - posZ) / scaleZ;

        const tris = model.cpuTriangles;
        const metas = model.cpuTriMeta;
        const candidateIndices = model.spatialGrid
            ? model.spatialGrid.getTrianglesAt(localX, localZ)
            : null;
        const count = candidateIndices ? candidateIndices.length : tris.length;
        if (count === 0) return null;

        let bestY = -Infinity;
        let bestNormal = null;
        let bestTriIndex = -1;

        const rayCeiling = currentY + maxStepUp;
        const rayFloor = currentY - maxStepDown;

        if (isIdentity) {
            for (let i = 0; i < count; i++) {
                const idx = candidateIndices ? candidateIndices[i] : i;
                const meta = metas[idx];
                // Most upward-facing planes (ny >= 0.2) provide ground collision; obstacle props are walkable if surface is relatively flat (ny >= 0.6)
                if (meta.ny < 0.2 || meta.invDet === 0.0 || (meta.isObstacleProp && meta.ny < 0.6)) continue;
                if (meta.maxY < rayFloor || meta.minY > rayCeiling) continue;
                if (x < meta.minX || x > meta.maxX || z < meta.minZ || z > meta.maxZ) continue;

                const tri = tris[idx];
                const pA = tri[0], pB = tri[1], pC = tri[2];
                const dxC = x - pC[0], dzC = z - pC[2];
                const wA = ((pB[2] - pC[2]) * dxC + (pC[0] - pB[0]) * dzC) * meta.invDet;
                if (wA < 0.0 || wA > 1.0) continue;
                const wB = ((pC[2] - pA[2]) * dxC + (pA[0] - pC[0]) * dzC) * meta.invDet;
                if (wB < 0.0) continue;
                const wC = 1.0 - wA - wB;
                if (wC < 0.0) continue;

                const heightY = wA * pA[1] + wB * pB[1] + wC * pC[1];
                if (heightY <= rayCeiling && heightY >= rayFloor && heightY > bestY) {
                    bestY = heightY;
                    bestTriIndex = idx;
                    bestNormal = meta.normal;
                }
            }
        } else {
            for (let i = 0; i < count; i++) {
                const idx = candidateIndices ? candidateIndices[i] : i;
                if (metas && metas[idx] && metas[idx].isObstacleProp && metas[idx].ny < 0.6) continue;
                const tri = tris[idx];

                SCRATCH_PA[0] = tri[0][0] * scaleX + posX;
                SCRATCH_PA[1] = tri[0][1] * scaleY + posY;
                SCRATCH_PA[2] = tri[0][2] * scaleZ + posZ;

                SCRATCH_PB[0] = tri[1][0] * scaleX + posX;
                SCRATCH_PB[1] = tri[1][1] * scaleY + posY;
                SCRATCH_PB[2] = tri[1][2] * scaleZ + posZ;

                SCRATCH_PC[0] = tri[2][0] * scaleX + posX;
                SCRATCH_PC[1] = tri[2][1] * scaleY + posY;
                SCRATCH_PC[2] = tri[2][2] * scaleZ + posZ;

                const det = (SCRATCH_PB[2] - SCRATCH_PC[2]) * (SCRATCH_PA[0] - SCRATCH_PC[0]) + (SCRATCH_PC[0] - SCRATCH_PB[0]) * (SCRATCH_PA[2] - SCRATCH_PC[2]);
                if (Math.abs(det) < 1e-6) continue;

                const wA = ((SCRATCH_PB[2] - SCRATCH_PC[2]) * (x - SCRATCH_PC[0]) + (SCRATCH_PC[0] - SCRATCH_PB[0]) * (z - SCRATCH_PC[2])) / det;
                const wB = ((SCRATCH_PC[2] - SCRATCH_PA[2]) * (x - SCRATCH_PC[0]) + (SCRATCH_PA[0] - SCRATCH_PC[0]) * (z - SCRATCH_PC[2])) / det;
                const wC = 1.0 - wA - wB;

                if (wA >= 0 && wB >= 0 && wC >= 0) {
                    const heightY = wA * SCRATCH_PA[1] + wB * SCRATCH_PB[1] + wC * SCRATCH_PC[1];
                    if (heightY <= rayCeiling && heightY >= rayFloor) {
                        let nx = (SCRATCH_PB[1] - SCRATCH_PA[1]) * (SCRATCH_PC[2] - SCRATCH_PA[2]) - (SCRATCH_PB[2] - SCRATCH_PA[2]) * (SCRATCH_PC[1] - SCRATCH_PA[1]);
                        let ny = (SCRATCH_PB[2] - SCRATCH_PA[2]) * (SCRATCH_PC[0] - SCRATCH_PA[0]) - (SCRATCH_PB[0] - SCRATCH_PA[0]) * (SCRATCH_PC[2] - SCRATCH_PA[2]);
                        let nz = (SCRATCH_PB[0] - SCRATCH_PA[0]) * (SCRATCH_PC[1] - SCRATCH_PA[1]) - (SCRATCH_PB[1] - SCRATCH_PA[1]) * (SCRATCH_PC[0] - SCRATCH_PA[0]);
                        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
                        const len = Math.hypot(nx, ny, nz) || 1.0;
                        const normY = ny / len;
                        if (normY < 0.2) continue;

                        if (heightY > bestY) {
                            bestY = heightY;
                            bestTriIndex = idx;
                            bestNormal = [nx / len, normY, nz / len];
                        }
                    }
                }
            }
        }

        if (!bestNormal) return null;
        const bestMeta = (metas && bestTriIndex >= 0) ? metas[bestTriIndex] : null;
        this._groundHitResult.heightY = bestY;
        this._groundHitResult.normal = bestNormal;
        this._groundHitResult.triIndex = bestTriIndex;
        this._groundHitResult.isCoastal = bestMeta ? Boolean(bestMeta.isCoastal) : false;
        this._groundHitResult.nodeName = bestMeta ? bestMeta.nodeName : '';
        this._groundHitResult.meshName = bestMeta ? bestMeta.meshName : '';
        return this._groundHitResult;
    }

    raycastSegment(origin, target, maxWalkableNormalY = 1.1) {
        const model = this.model;
        if (!model || !model.cpuTriangles || model.cpuTriangles.length === 0) return null;
        if (!model.cpuTriMeta) model.cpuTriMeta = buildTriangleMeta(model.cpuTriangles);

        const ox = origin[0], oy = origin[1], oz = origin[2];
        const tx = target[0], ty = target[1], tz = target[2];
        const dirX = tx - ox;
        const dirY = ty - oy;
        const dirZ = tz - oz;
        const maxDist = Math.hypot(dirX, dirY, dirZ);
        if (maxDist < 1e-6) return null;

        const rdx = dirX / maxDist;
        const rdy = dirY / maxDist;
        const rdz = dirZ / maxDist;

        const posX = this.position[0], posY = this.position[1], posZ = this.position[2];
        const scaleX = this.scale[0], scaleY = this.scale[1], scaleZ = this.scale[2];
        const isIdentity = (posX === 0 && posY === 0 && posZ === 0 && scaleX === 1 && scaleY === 1 && scaleZ === 1);

        const rayMinX = Math.min(ox, tx), rayMaxX = Math.max(ox, tx);
        const rayMinY = Math.min(oy, ty), rayMaxY = Math.max(oy, ty);
        const rayMinZ = Math.min(oz, tz), rayMaxZ = Math.max(oz, tz);

        const tris = model.cpuTriangles;
        const metas = model.cpuTriMeta;
        const candidateIndices = (model.spatialGrid && isIdentity)
            ? model.spatialGrid.getTrianglesInAABB(rayMinX, rayMaxX, rayMinZ, rayMaxZ, tris.length)
            : null;
        const count = candidateIndices ? candidateIndices.length : tris.length;
        if (count === 0) return null;

        let closestT = maxDist;

        if (isIdentity) {
            for (let i = 0; i < count; i++) {
                const idx = candidateIndices ? candidateIndices[i] : i;
                const meta = metas[idx];
                if (maxWalkableNormalY < 1.0 && meta.ny >= maxWalkableNormalY) continue;
                if (meta.maxY < rayMinY || meta.minY > rayMaxY ||
                    meta.maxX < rayMinX || meta.minX > rayMaxX ||
                    meta.maxZ < rayMinZ || meta.minZ > rayMaxZ) continue;

                const hx = rdy * meta.e2z - rdz * meta.e2y;
                const hy = rdz * meta.e2x - rdx * meta.e2z;
                const hz = rdx * meta.e2y - rdy * meta.e2x;

                const a = meta.e1x * hx + meta.e1y * hy + meta.e1z * hz;
                if (a > -1e-6 && a < 1e-6) continue;

                const pA = tris[idx][0];
                const f = 1.0 / a;
                const sx = ox - pA[0];
                const sy = oy - pA[1];
                const sz = oz - pA[2];

                const u = f * (sx * hx + sy * hy + sz * hz);
                if (u < 0.0 || u > 1.0) continue;

                const qx = sy * meta.e1z - sz * meta.e1y;
                const qy = sz * meta.e1x - sx * meta.e1z;
                const qz = sx * meta.e1y - sy * meta.e1x;

                const v = f * (rdx * qx + rdy * qy + rdz * qz);
                if (v < 0.0 || u + v > 1.0) continue;

                const t = f * (meta.e2x * qx + meta.e2y * qy + meta.e2z * qz);
                if (t > 1e-4 && t < closestT) {
                    closestT = t;
                }
            }
        } else {
            for (let i = 0; i < count; i++) {
                const tri = tris[candidateIndices ? candidateIndices[i] : i];
                SCRATCH_PA[0] = tri[0][0] * scaleX + posX;
                SCRATCH_PA[1] = tri[0][1] * scaleY + posY;
                SCRATCH_PA[2] = tri[0][2] * scaleZ + posZ;

                SCRATCH_PB[0] = tri[1][0] * scaleX + posX;
                SCRATCH_PB[1] = tri[1][1] * scaleY + posY;
                SCRATCH_PB[2] = tri[1][2] * scaleZ + posZ;

                SCRATCH_PC[0] = tri[2][0] * scaleX + posX;
                SCRATCH_PC[1] = tri[2][1] * scaleY + posY;
                SCRATCH_PC[2] = tri[2][2] * scaleZ + posZ;

                const e1x = SCRATCH_PB[0] - SCRATCH_PA[0], e1y = SCRATCH_PB[1] - SCRATCH_PA[1], e1z = SCRATCH_PB[2] - SCRATCH_PA[2];
                const e2x = SCRATCH_PC[0] - SCRATCH_PA[0], e2y = SCRATCH_PC[1] - SCRATCH_PA[1], e2z = SCRATCH_PC[2] - SCRATCH_PA[2];

                const hx = rdy * e2z - rdz * e2y;
                const hy = rdz * e2x - rdx * e2z;
                const hz = rdx * e2y - rdy * e2x;

                const a = e1x * hx + e1y * hy + e1z * hz;
                if (Math.abs(a) < 1e-6) continue;

                const f = 1.0 / a;
                const sx = ox - SCRATCH_PA[0], sy = oy - SCRATCH_PA[1], sz = oz - SCRATCH_PA[2];
                const u = f * (sx * hx + sy * hy + sz * hz);
                if (u < 0.0 || u > 1.0) continue;

                const qx = sy * e1z - sz * e1y;
                const qy = sz * e1x - sx * e1z;
                const qz = sx * e1y - sy * e1x;
                const v = f * (rdx * qx + rdy * qy + rdz * qz);
                if (v < 0.0 || u + v > 1.0) continue;

                const t = f * (e2x * qx + e2y * qy + e2z * qz);
                if (t > 1e-4 && t < closestT) {
                    if (maxWalkableNormalY < 1.0) {
                        const nx = e1y * e2z - e1z * e2y;
                        const ny = e1z * e2x - e1x * e2z;
                        const nz = e1x * e2y - e1y * e2x;
                        const nLen = Math.hypot(nx, ny, nz) || 1.0;
                        if (Math.abs(ny / nLen) >= maxWalkableNormalY) continue;
                    }
                    closestT = t;
                }
            }
        }

        return closestT < maxDist ? (closestT / maxDist) : null;
    }

    /**
     * Single-pass spatial-grid accelerated radial wall & hanging-overhang collision solver.
     */
    resolveWallCollisionsFast(x, y, z, radius = 0.5) {
        const model = this.model;
        if (!model || !model.cpuTriangles || model.cpuTriangles.length === 0) return [x, y, z];
        if (!model.cpuTriMeta) model.cpuTriMeta = buildTriangleMeta(model.cpuTriangles);

        const posX = this.position[0], posY = this.position[1], posZ = this.position[2];
        const scaleX = this.scale[0], scaleY = this.scale[1], scaleZ = this.scale[2];
        const isIdentity = (posX === 0 && posY === 0 && posZ === 0 && scaleX === 1 && scaleY === 1 && scaleZ === 1);
        if (!isIdentity || !model.spatialGrid) {
            return null; // Fallback to generic raycastSegment loop
        }

        const rayDistance = radius + 0.3;
        const footY = y - 1.0;
        const minCheckY = footY + 0.4;
        const maxCheckY = footY + 1.8;

        const tris = model.cpuTriangles;
        const metas = model.cpuTriMeta;
        const candidates = model.spatialGrid.getTrianglesInAABB(
            x - rayDistance, x + rayDistance,
            z - rayDistance, z + rayDistance,
            tris.length
        );
        if (candidates.length === 0) return [x, y, z];

        // Pre-filter to triangles within the character's local XZ radius and [footY+0.4, footY+1.8] vertical band
        const localTris = SCRATCH_LOCAL_WALL_TRIS;
        localTris.length = 0;
        const boxMinX = x - rayDistance, boxMaxX = x + rayDistance;
        const boxMinZ = z - rayDistance, boxMaxZ = z + rayDistance;

        for (let i = 0, len = candidates.length; i < len; i++) {
            const idx = candidates[i];
            const meta = metas[idx];
            if (meta.maxY < minCheckY || meta.minY > maxCheckY) continue;
            if (meta.maxX < boxMinX || meta.minX > boxMaxX || meta.maxZ < boxMinZ || meta.minZ > boxMaxZ) continue;
            // Purely flat walkable floor triangles below waist height can never obstruct horizontal wall rays
            if (meta.ny >= MAX_SLOPE_COS_62 && meta.maxY <= footY + 1.05) continue;
            localTris.push(idx);
        }

        if (localTris.length === 0) return [x, y, z];

        let correctedX = x;
        let correctedZ = z;
        const sampleY0 = footY + 0.45;
        const sampleY1 = footY + 1.0;
        const sampleY2 = footY + 1.45;
        const sampleY3 = footY + 1.8;

        for (let aIdx = 0; aIdx < 8; aIdx++) {
            const rdx = WALL_ANGLES_COS[aIdx];
            const rdz = WALL_ANGLES_SIN[aIdx];
            let closestDist = radius;

            for (let tIdx = 0, tLen = localTris.length; tIdx < tLen; tIdx++) {
                const idx = localTris[tIdx];
                const meta = metas[idx];
                const isWalkableSlope = meta.ny >= MAX_SLOPE_COS_62;

                // Horizontal ray (rdy = 0): H = [-rdz * e2y, rdz * e2x - rdx * e2z, rdx * e2y]
                const hx = -rdz * meta.e2y;
                const hy = rdz * meta.e2x - rdx * meta.e2z;
                const hz = rdx * meta.e2y;

                const det = meta.e1x * hx + meta.e1y * hy + meta.e1z * hz;
                if (det > -1e-6 && det < 1e-6) continue;
                const f = 1.0 / det;

                const pA = tris[idx][0];
                const sx = correctedX - pA[0];
                const sz = correctedZ - pA[2];
                const baseU = sx * hx + sz * hz;
                const qy = sz * meta.e1x - sx * meta.e1z;
                const baseV = rdx * ( -sz * meta.e1y ) + rdz * ( sx * meta.e1y );
                const baseT = meta.e2y * qy;

                for (let s = 0; s < 4; s++) {
                    if (s <= 1 && isWalkableSlope) continue;
                    const syVal = s === 0 ? sampleY0 : (s === 1 ? sampleY1 : (s === 2 ? sampleY2 : sampleY3));
                    if (syVal < meta.minY || syVal > meta.maxY) continue;

                    const syDiff = syVal - pA[1];
                    const u = f * (baseU + syDiff * hy);
                    if (u < 0.0 || u > 1.0) continue;

                    const qx = syDiff * meta.e1z - sz * meta.e1y;
                    const qz = sx * meta.e1y - syDiff * meta.e1x;
                    const v = f * (rdx * qx + rdz * qz);
                    if (v < 0.0 || u + v > 1.0) continue;

                    const t = f * (meta.e2x * qx + baseT + meta.e2z * qz);
                    if (t > 1e-4 && t < closestDist) {
                        closestDist = t;
                    }
                }
            }

            if (closestDist < radius) {
                const penetration = radius - closestDist;
                correctedX -= rdx * penetration;
                correctedZ -= rdz * penetration;
            }
        }

        return [correctedX, y, correctedZ];
    }
}

class WorldRenderer {
    constructor(canvas) {
        this.gl = canvas.getContext('webgl2');
        if (!this.gl) throw new Error("WebGL 2 not supported.");

        this.canvas = canvas;
        this.gameObjects = [];

        this.projMatrix = Mat4.create();
        this.viewMatrix = Mat4.create();

        this.waterEnabled = false;
        this.waterElevation = 0.0;
        this.waterVAO = null;
        this.waterIndexCount = 0;
        this.waterProgram = null;
        this.waterLocations = null;

        this.initGL();
        this.initShaders();
        this.initWaterMesh();
    }

    initGL() {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round((rect.width > 0 ? rect.width : window.innerWidth) * dpr);
        const h = Math.round((rect.height > 0 ? rect.height : window.innerHeight) * dpr);
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        Mat4.perspective(this.projMatrix, Math.PI / 4, this.canvas.width / this.canvas.height, 0.1, 2000.0);
    }

    createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    }

    initShaders() {
        const gl = this.gl;
        const vs = this.createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        
        gl.bindAttribLocation(this.program, 0, 'a_position');
        gl.bindAttribLocation(this.program, 1, 'a_normal');
        gl.bindAttribLocation(this.program, 2, 'a_texCoord');

        gl.linkProgram(this.program);

        this.locations = {
            u_modelMatrix: gl.getUniformLocation(this.program, 'u_modelMatrix'),
            u_viewMatrix: gl.getUniformLocation(this.program, 'u_viewMatrix'),
            u_projectionMatrix: gl.getUniformLocation(this.program, 'u_projectionMatrix'),
            u_color: gl.getUniformLocation(this.program, 'u_color'),
            u_texture: gl.getUniformLocation(this.program, 'u_texture'),
            u_useTexture: gl.getUniformLocation(this.program, 'u_useTexture'),
            u_unlit: gl.getUniformLocation(this.program, 'u_unlit')
        };

        const waterVsSource = (typeof WATER_VS_SOURCE !== 'undefined') ? WATER_VS_SOURCE : (window.WATER_VS_SOURCE || null);
        const waterFsSource = (typeof WATER_FS_SOURCE !== 'undefined') ? WATER_FS_SOURCE : (window.WATER_FS_SOURCE || null);

        if (waterVsSource && waterFsSource) {
            try {
                const waterVs = this.createShader(gl, gl.VERTEX_SHADER, waterVsSource);
                const waterFs = this.createShader(gl, gl.FRAGMENT_SHADER, waterFsSource);

                this.waterProgram = gl.createProgram();
                gl.attachShader(this.waterProgram, waterVs);
                gl.attachShader(this.waterProgram, waterFs);

                gl.bindAttribLocation(this.waterProgram, 0, 'a_position');
                gl.bindAttribLocation(this.waterProgram, 1, 'a_texCoord');

                gl.linkProgram(this.waterProgram);

                this.waterLocations = {
                    u_viewMatrix: gl.getUniformLocation(this.waterProgram, 'u_viewMatrix'),
                    u_projectionMatrix: gl.getUniformLocation(this.waterProgram, 'u_projectionMatrix'),
                    u_waterCenter: gl.getUniformLocation(this.waterProgram, 'u_waterCenter'),
                    u_waterElevation: gl.getUniformLocation(this.waterProgram, 'u_waterElevation'),
                    u_time: gl.getUniformLocation(this.waterProgram, 'u_time'),
                    u_cameraPosition: gl.getUniformLocation(this.waterProgram, 'u_cameraPosition')
                };
            } catch (wErr) {
                console.warn('[Renderer] Water shader compilation error:', wErr);
            }
        }
    }

    initWaterMesh() {
        const gl = this.gl;
        const resolution = 90;
        const maxRadius = 1600.0;

        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= resolution; i++) {
            const u = (i / resolution) * 2.0 - 1.0;
            const signU = u < 0 ? -1 : 1;
            const distU = signU * Math.pow(Math.abs(u), 2.2) * maxRadius;

            for (let j = 0; j <= resolution; j++) {
                const v = (j / resolution) * 2.0 - 1.0;
                const signV = v < 0 ? -1 : 1;
                const distV = signV * Math.pow(Math.abs(v), 2.2) * maxRadius;

                positions.push(distU, 0.0, distV);
                uvs.push((u + 1.0) * 0.5, (v + 1.0) * 0.5);
            }
        }

        const stride = resolution + 1;
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const i0 = i * stride + j;
                const i1 = (i + 1) * stride + j;
                const i2 = (i + 1) * stride + (j + 1);
                const i3 = i * stride + (j + 1);

                indices.push(i0, i1, i2);
                indices.push(i0, i2, i3);
            }
        }

        this.waterVAO = gl.createVertexArray();
        gl.bindVertexArray(this.waterVAO);

        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

        this.waterIndexCount = indices.length;
        gl.bindVertexArray(null);
    }

    addEntity(gameObject) {
        this.gameObjects.push(gameObject);
    }

    render(cameraPosition, cameraTarget) {
        const gl = this.gl;

        gl.clearColor(0.08, 0.08, 0.12, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(this.program);

        Mat4.lookAt(this.viewMatrix, cameraPosition, cameraTarget, [0, 1, 0]);

        gl.uniformMatrix4fv(this.locations.u_projectionMatrix, false, this.projMatrix);
        gl.uniformMatrix4fv(this.locations.u_viewMatrix, false, this.viewMatrix);

        // 1. Render all opaque game objects
        for (const obj of this.gameObjects) {
            if (obj.visible === false) continue;
            obj.updateMatrix();
            gl.uniform3fv(this.locations.u_color, obj.color);
            gl.uniform1i(this.locations.u_unlit, obj.isUnlit ? 1 : 0);

            obj.model.draw(this.locations, obj.transformMatrix, obj.isDynamic);
        }

        // 2. Render Water Surface Pass (semi-transparent, depth tested)
        if (this.waterEnabled && this.waterVAO && this.waterProgram) {
            gl.useProgram(this.waterProgram);

            const snapX = Math.floor(cameraPosition[0]);
            const snapZ = Math.floor(cameraPosition[2]);
            const waterCenter = [snapX, 0.0, snapZ];
            const waterElevation = this.waterElevation !== undefined ? this.waterElevation : 0.0;
            const nowSec = performance.now() * 0.001;

            gl.uniformMatrix4fv(this.waterLocations.u_projectionMatrix, false, this.projMatrix);
            gl.uniformMatrix4fv(this.waterLocations.u_viewMatrix, false, this.viewMatrix);
            gl.uniform3fv(this.waterLocations.u_waterCenter, waterCenter);
            gl.uniform1f(this.waterLocations.u_waterElevation, waterElevation);
            gl.uniform1f(this.waterLocations.u_time, nowSec);
            gl.uniform3fv(this.waterLocations.u_cameraPosition, cameraPosition);

            gl.depthMask(false);
            gl.bindVertexArray(this.waterVAO);
            gl.drawElements(gl.TRIANGLES, this.waterIndexCount, gl.UNSIGNED_INT, 0);
            gl.bindVertexArray(null);
            gl.depthMask(true);
        }
    }
}

function multiplyMat4(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
}

function transformVec3(v, m) {
    const x = v[0], y = v[1], z = v[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1.0;
    return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    ];
}

function getComponentCount(type) {
    return { 'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16 }[type] || 0;
}

function getComponentByteSize(componentType) {
    return { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[componentType] || 0;
}

function getElementSize(accessor) {
    return getComponentCount(accessor.type) * getComponentByteSize(accessor.componentType);
}

if (typeof window !== 'undefined') {
    window.GLTFModel = GLTFModel;
    window.GameObject = GameObject;
}
