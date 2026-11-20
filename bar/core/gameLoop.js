// Main Game Engine Loop & Dynamic Room Lifecycle Manager

let renderer;
let characterEntity, worldEntity;
let currentRoomName = "world";
let isTransitioning = false;
let nearbyExit = null;

const ROOM_COORDINATES = {
    'world': {
        name: 'TEMPLE HARBOR',
        x: 0.0,
        z: 0.0,
        seaRadius: 280.0,
        defaultEntrance: 'en_l__world',
        atSea: true
    },
    'ocean_haven': {
        name: 'OCEAN HAVEN',
        x: 0.0,
        z: 1500.0,
        seaRadius: 320.0,
        defaultEntrance: 'en_l__world',
        atSea: true
    },
    'kokiri_forest/links_house': {
        name: "LINK'S HOUSE",
        x: -450.0,
        z: 350.0,
        seaRadius: 180.0,
        defaultEntrance: 'en_l__kokiri_forest/links_house',
        atSea: true
    },
    'links_house': {
        name: "LINK'S HOUSE",
        x: -450.0,
        z: 350.0,
        seaRadius: 180.0,
        defaultEntrance: 'en_l__kokiri_forest/links_house',
        atSea: true
    }
};
window.ROOM_COORDINATES = ROOM_COORDINATES;

const ROOM_MIME_MAP = {
    'gltf': 'model/gltf+json',
    'glb': 'model/gltf-binary',
    'bin': 'application/octet-stream',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'json': 'application/json',
    'txt': 'text/plain'
};

function parseRoomPaxTarBuffer(arrayBuffer) {
    const loader = window.TarAppLoader || (window.parent && window.parent.TarAppLoader);
    if (loader && typeof loader.parseTarBuffer === 'function') {
        return loader.parseTarBuffer(arrayBuffer);
    }
    const files = [];
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    let offset = 0;
    let pendingLongName = null;

    const readString = (off, len) => {
        let end = off;
        while (end < off + len && view.getUint8(end) !== 0) end++;
        return decoder.decode(new Uint8Array(arrayBuffer, off, end - off));
    };

    while (offset + 512 <= view.byteLength) {
        if (view.getUint8(offset) === 0 && !pendingLongName) {
            let isZero = true;
            for (let i = 0; i < 512; i += 32) {
                if (view.getUint8(offset + i) !== 0) { isZero = false; break; }
            }
            if (isZero) break;
        }

        const rawName = readString(offset, 100);
        const fileSizeOctal = readString(offset + 124, 12);
        const fileSize = parseInt(fileSizeOctal.trim(), 8) || 0;
        const fileType = view.getUint8(offset + 156);
        const ustarMagic = readString(offset + 257, 5);
        const ustarPrefix = (ustarMagic === 'ustar') ? readString(offset + 345, 155) : '';

        offset += 512;

        // GNU Long filename header ('L' = 76)
        if (fileType === 76 || fileType === 0x4C) {
            pendingLongName = readString(offset, fileSize).replace(/\0+$/, '');
            offset += Math.ceil(fileSize / 512) * 512;
            continue;
        }

        // POSIX PAX Extended Header ('x' = 120)
        if (fileType === 120 || fileType === 0x78) {
            const paxText = decoder.decode(new Uint8Array(arrayBuffer, offset, fileSize));
            const match = paxText.match(/\d+ path=([^\n]+)/);
            if (match) pendingLongName = match[1];
            offset += Math.ceil(fileSize / 512) * 512;
            continue;
        }

        let fileName = pendingLongName || (ustarPrefix ? `${ustarPrefix}/${rawName}` : rawName);
        pendingLongName = null;
        if (!fileName) break;
        fileName = fileName.replace(/^\.\//, '').replace(/^\//, '');

        if (fileType === 0 || fileType === 48 || fileType === 0x30) {
            const fileData = new Uint8Array(arrayBuffer, offset, fileSize);
            const ext = fileName.split('.').pop().toLowerCase();
            const mimeType = ROOM_MIME_MAP[ext] || 'application/octet-stream';
            const blob = new Blob([fileData], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);
            files.push({
                name: fileName,
                data: fileData,
                blob: blob,
                url: blobUrl,
                mimeType: mimeType,
                size: fileSize
            });
        }
        offset += Math.ceil(fileSize / 512) * 512;
    }
    return files;
}

async function mountParsedRoomEntries(entries, remoteHost, sourceRoomName = currentRoomName) {
    if (!Array.isArray(entries) || entries.length === 0) return false;
    const gltfEntries = entries.filter(e => e.name && e.name.toLowerCase().endsWith('.gltf'));
    if (gltfEntries.length === 0) return false;

    const loader = window.TarAppLoader || (window.parent && window.parent.TarAppLoader);
    const parentAddrBar = (window.parent && window.parent.addrBarSystem) || window.addrBarSystem;

    if (loader && !loader.fileSystem) loader.fileSystem = {};
    if (loader && !loader.createdUrls) loader.createdUrls = [];

    for (const entry of entries) {
        const cleanName = entry.name.replace(/^\.\//, '').replace(/^\//, '');
        const ext = cleanName.split('.').pop().toLowerCase();
        const mimeType = entry.mimeType || ROOM_MIME_MAP[ext] || 'application/octet-stream';
        const blob = entry.blob || new Blob([entry.data], { type: mimeType });
        const url = entry.url || URL.createObjectURL(blob);

        const record = {
            name: cleanName,
            data: entry.data,
            blob: blob,
            url: url,
            mimeType: mimeType,
            size: entry.size || (entry.data ? entry.data.byteLength : 0)
        };

        const fileNameOnly = cleanName.split('/').pop();
        const registerInFs = (fsObj) => {
            if (!fsObj) return;
            fsObj[cleanName] = record;
            fsObj[`rooms/${cleanName}`] = record;
            fsObj[`rooms/${fileNameOnly}`] = record;
            fsObj[fileNameOnly] = record;
        };

        if (loader) {
            loader.createdUrls.push(url);
            registerInFs(loader.fileSystem);
        }
        if (parentAddrBar) {
            if (Array.isArray(parentAddrBar.created_urls)) parentAddrBar.created_urls.push(url);
            registerInFs(parentAddrBar.file_system);
        }
    }

    const primaryGltf = gltfEntries[0].name.replace(/^\.\//, '').replace(/^\//, '');
    const roomKey = primaryGltf.replace(/^rooms\//, '').replace(/\.gltf$/i, '');

    await loadRoom(roomKey, sourceRoomName);

    if (remoteHost && window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.switchServer === 'function') {
        window.DarkWorldMultiplayer.switchServer(remoteHost, currentRoomName);
    }
    return true;
}
window.mountParsedRoomEntries = mountParsedRoomEntries;

async function mountExternalRoomPaxTar(targetUrl, sourceRoomName = currentRoomName) {
    if (!targetUrl || typeof targetUrl !== 'string') return false;
    let normalized = targetUrl.trim();
    if (normalized.startsWith('bar://')) {
        normalized = 'https://' + normalized.slice(6);
    } else if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized.replace(/^\/+/, '');
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(normalized);
    } catch (e) {
        return false;
    }

    const remoteHost = parsedUrl.hostname;
    const origin = parsedUrl.origin;
    const pathClean = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
    const candidates = [];

    if (normalized.toLowerCase().endsWith('.tar')) {
        candidates.push(normalized);
    } else if (pathClean) {
        const roomSlug = pathClean.replace(/\.gltf$/i, '');
        candidates.push(`${origin}/${roomSlug}.tar`);
        candidates.push(`${origin}/rooms/${roomSlug}.tar`);
        candidates.push(`${origin}/cannon/${roomSlug}.tar`);
        candidates.push(`${origin}/cannon/room.tar`);
        candidates.push(`${origin}/room.tar`);
    } else {
        candidates.push(`${origin}/cannon/room.tar`);
        candidates.push(`${origin}/room.tar`);
        candidates.push(`${origin}/rooms/world.tar`);
    }

    for (const candidateUrl of candidates) {
        try {
            const resp = await fetch(candidateUrl, { method: 'GET', cache: 'no-cache' });
            if (!resp.ok) continue;
            const buffer = await resp.arrayBuffer();
            if (!buffer || buffer.byteLength < 512) continue;

            const entries = parseRoomPaxTarBuffer(buffer);
            const hasIndexHtml = entries.some(e => {
                const lower = (e.name || '').toLowerCase();
                return lower === 'index.html' || lower === 'index_3.html' || lower.endsWith('/index.html');
            });
            const hasGltf = entries.some(e => (e.name || '').toLowerCase().endsWith('.gltf'));

            if (hasGltf && !hasIndexHtml) {
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('log:entry', {
                        tag: 'OK',
                        message: `Streamed PAX TAR room archive from '${candidateUrl}'; keeping engine running and connecting to '${remoteHost}' server.`
                    });
                }
                return await mountParsedRoomEntries(entries, remoteHost, sourceRoomName);
            }
        } catch (err) {
            // Try next candidate
        }
    }
    return false;
}

async function handleExternalExit(targetUrl, sourceRoomName = currentRoomName) {
    console.log(`[Bar External Hyperlink] Warping to: ${targetUrl}`);
    // 1. Attempt instantaneous PAX TAR room hot-mount + server switch without stopping the running engine
    try {
        const mountedInPlace = await mountExternalRoomPaxTar(targetUrl, sourceRoomName);
        if (mountedInPlace) return;
    } catch (e) {
        console.warn('[Bar External Hyperlink] PAX TAR room probe notice:', e);
    }

    // 2. Fallback to full archive / site navigation if destination is not a standalone PAX TAR room
    if (window.parent && window.parent !== window && typeof window.parent.addrBarLaunch === 'function') {
        window.parent.addrBarLaunch(targetUrl);
    } else if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'ADDR_BAR_LAUNCH', url: targetUrl }, '*');
    } else {
        window.location.href = targetUrl;
    }
}

function initEngine() {
    window.activeDebugTab = 0;

    if (window.GameState) {
        window.GameState.isCutsceneActive = false;
        window.GameState.lyreMarker = null;
        window.GameState.currentDimension = 'LIGHT';
    }

    try {
        debugMenu = new DebugMenu();
        debugMenu.init();
        updateMenuOverlays();
    } catch (e) {
        console.error("[Engine Error] Failed during DebugMenu initialization:", e);
    }

    if (typeof window.EventBus !== 'undefined') {
        window.EventBus.emit('log:entry', { tag: 'OK', message: 'DOM loaded and dynamic mobile viewport overlays ready.' });
        
        window.EventBus.on('room:load', (data) => {
            const targetRoom = typeof data === 'string' ? data : data.targetRoom;
            const sourceRoom = typeof data === 'object' ? data.sourceRoom : currentRoomName;
            const preservePosition = typeof data === 'object' ? Boolean(data.preservePosition) : false;
            
            // K-PAX Pix Frame Aperture Trigger
            if (targetRoom === 'pix_frame' || targetRoom === 'pix_click') {
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('log:entry', { 
                        tag: 'K-PAX', 
                        message: 'Pix Frame Clicked: Light solidified through aperture. K-PAX TAR parcel expanded!' 
                    });
                    window.EventBus.emit('sfx:play', 'assign');
                }
                console.log('[K-PAX] Aperture activated. Solidifying parcel light...');
                
                // Trigger download or fetch of PAX TAR parcel if requested
                const a = document.createElement('a');
                a.href = 'cannon/bar.tar';
                a.download = 'pax_starter_parcel.tar';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }

            if (typeof targetRoom === 'string' && (targetRoom.startsWith('http://') || targetRoom.startsWith('https://') || targetRoom.startsWith('bar://'))) {
                handleExternalExit(targetRoom);
                return;
            }
            loadRoom(targetRoom, sourceRoom, preservePosition);
        });
    }

    if (typeof audioManager !== 'undefined') {
        audioManager.updateLocation('vow_entry');
    }

    const canvas = document.getElementById('glCanvas');
    if (!canvas) {
        console.error("[Engine Error] Could not find <canvas id='glCanvas'> element in DOM!");
        return;
    }

    window.focus();
    canvas.focus();

    window.addEventListener('pointerdown', () => {
        window.focus();
        if (canvas) canvas.focus();
    });

    try {
        renderer = new WorldRenderer(canvas);
    } catch (e) {
        console.error("[Engine Error] Failed to initialize WorldRenderer:", e);
        return;
    }

    if (typeof window.EventBus !== 'undefined') {
        window.EventBus.emit('log:entry', { tag: 'OK', message: 'WebGL 2 Context and Shaders bound.' });
    }

    const loader = window.TarAppLoader || (window.parent && window.parent.TarAppLoader);
    const playerGltfPath = (loader && loader.fileSystem && loader.fileSystem['entities/player.gltf'])
        ? 'entities/player.gltf'
        : ((loader && loader.fileSystem && loader.fileSystem['gltf/player.gltf']) ? 'gltf/player.gltf' : 'entities/player.gltf');
    const resolvedPlayerUrl = safeResolveUrl(playerGltfPath);

    const wingsGltfPath = (loader && loader.fileSystem && loader.fileSystem['entities/ego_wings.gltf'])
        ? 'entities/ego_wings.gltf'
        : 'entities/ego_wings.gltf';
    const resolvedWingsUrl = safeResolveUrl(wingsGltfPath);

    const characterModel = new GLTFModel(renderer.gl);
    characterModel.load(resolvedPlayerUrl).then(async () => {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { tag: 'OK', message: `Loaded '${playerGltfPath}'.` });
        }
        try {
            const wingsModel = new GLTFModel(renderer.gl);
            await wingsModel.load(resolvedWingsUrl);
            characterModel.attachWingModel(wingsModel);
            GLTFModel._sharedWingsModel = wingsModel;
        } catch (e) {
            console.warn('[Engine] Could not load ego_wings 3D model:', e);
        }
        characterEntity = new GameObject(characterModel, [1.0, 1.0, 1.0], true, true);
        renderer.addEntity(characterEntity);

        if (window.GameState) {
            window.GameState.characterEntity = characterEntity;
            window.GameState.gameObjects = renderer.gameObjects;
            if (typeof window.GameState.updateHpUI === 'function') {
                window.GameState.updateHpUI();
            }
        }

        loadRoom("world");
    }).catch(err => {
        console.error(`[Engine Error] Failed to load player model from '${resolvedPlayerUrl}':`, err);
    });

    setupGameLoop();
}

function checkMultiplayerAccess() {
    const user = window.currentUser || (window.GameState ? window.GameState.currentUser : null);
    if (user && user.authenticated) return true;

    // Check session cookies
    const getCookie = (name) => {
        const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    };

    const token = getCookie('session_token');
    const dwUser = (getCookie('dw_user') || getCookie('username') || '').slice(0, 13);

    if (token && dwUser) {
        window.currentUser = {
            authenticated: true,
            username: dwUser,
            token: token || ''
        };
        if (window.GameState) window.GameState.currentUser = window.currentUser;
        return true;
    }

    // Default for players without an account: name is '?'
    window.currentUser = {
        authenticated: false,
        username: '?',
        token: ''
    };
    if (window.GameState) window.GameState.currentUser = window.currentUser;
    return true;
}
window.checkMultiplayerAccess = checkMultiplayerAccess;

function getEffectiveLocation() {
    let loc = window.location;
    try {
        if (window.top && window.top.location && window.top.location.href && !window.top.location.href.startsWith('about:')) {
            loc = window.top.location;
        } else if (window.parent && window.parent.location && window.parent.location.href && !window.parent.location.href.startsWith('about:')) {
            loc = window.parent.location;
        }
    } catch (e) {
        // Fallback to window.location if cross-origin access is blocked
    }
    return loc;
}
window.getEffectiveLocation = getEffectiveLocation;

function getAuthWebsiteName() {
    const loc = getEffectiveLocation();
    const hostname = (loc && loc.hostname) ? loc.hostname : '';
    const host = (loc && loc.host) ? loc.host : hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || /^192\.168\./.test(hostname) || /^10\./.test(hostname);

    if (isLocal) {
        const pathname = (loc && loc.pathname) ? loc.pathname : (window.location.pathname || '');
        const matches = [...pathname.matchAll(/\/([a-zA-Z0-9_.-]+\.[a-zA-Z]{2,})(?=\/|$)/g)]
            .filter(m => !/\.(php|html|htm|js|css|json)$/i.test(m[1]));
        if (matches.length > 0) {
            return matches[matches.length - 1][1];
        }
    }

    const resolvedLoadedHost = (window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.resolveLoadedHost === 'function')
        ? window.DarkWorldMultiplayer.resolveLoadedHost()
        : (window.targetServerHost || window.location.hostname || 'farmeraga.com');
    return host || resolvedLoadedHost;
}
window.getAuthWebsiteName = getAuthWebsiteName;

function getAuthSignupUrl() {
    let baseHref = '';
    try {
        if (window.parentPageUrl) {
            baseHref = window.parentPageUrl;
        } else {
            const loc = getEffectiveLocation();
            if (loc && loc.href && !loc.href.startsWith('about:')) {
                baseHref = loc.href;
            }
        }
    } catch (e) {}

    if (!baseHref && document.referrer && !document.referrer.startsWith('about:')) {
        baseHref = document.referrer;
    }
    if (!baseHref || baseHref.startsWith('about:')) {
        baseHref = window.location.protocol + '//' + (window.location.host || 'localhost') + '/';
    }

    try {
        const resolved = new URL('signup.html', baseHref);
        resolved.searchParams.set('redirect', baseHref);
        return resolved.href;
    } catch (e) {
        const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        return `${origin}/signup.html`;
    }
}
window.getAuthSignupUrl = getAuthSignupUrl;

// Shared visual indicators for the Hyperlink navigation system
// Exits: Overhead Tricurse Cursor (Click [K] to activate link)
// Entrances: Overhead Warp Pipe (Landing/emergence point)
let cachedCursorModel = null;
let cursorModelPromise = null;

async function getCachedCursorModel(gl) {
    if (cachedCursorModel && cachedCursorModel.isLoaded) {
        return cachedCursorModel;
    }
    if (!cursorModelPromise) {
        cursorModelPromise = (async () => {
            const cursorUrl = safeResolveUrl('props/tricurse_cursor.gltf');
            const model = new GLTFModel(gl);
            try {
                await model.load(cursorUrl);
                cachedCursorModel = model;
                return model;
            } catch (err) {
                console.warn(`[Engine] Could not load tricurse cursor model from '${cursorUrl}', trying fallback...`, err);
                try {
                    const fallbackUrl = safeResolveUrl('light/tricurse_cursor.gltf') || safeResolveUrl('gltf/tricurse_cursor.gltf');
                    const fallbackModel = new GLTFModel(gl);
                    await fallbackModel.load(fallbackUrl);
                    cachedCursorModel = fallbackModel;
                    return fallbackModel;
                } catch (fallbackErr) {
                    console.error('[Engine] Failed to load tricurse cursor fallback:', fallbackErr);
                    return null;
                }
            }
        })();
    }
    return cursorModelPromise;
}

let cachedPipeModel = null;
let pipeModelPromise = null;

async function getCachedPipeModel(gl) {
    if (cachedPipeModel && cachedPipeModel.isLoaded) {
        return cachedPipeModel;
    }
    if (!pipeModelPromise) {
        pipeModelPromise = (async () => {
            const pipeUrl = safeResolveUrl('props/entrance_pipe.gltf');
            const model = new GLTFModel(gl);
            try {
                await model.load(pipeUrl);
                cachedPipeModel = model;
                return model;
            } catch (err) {
                console.warn(`[Engine] Could not load entrance pipe model from '${pipeUrl}', trying fallback...`, err);
                try {
                    const fallbackUrl = safeResolveUrl('light/entrance_pipe.gltf') || safeResolveUrl('gltf/entrance_pipe.gltf');
                    const fallbackModel = new GLTFModel(gl);
                    await fallbackModel.load(fallbackUrl);
                    cachedPipeModel = fallbackModel;
                    return fallbackModel;
                } catch (fallbackErr) {
                    console.error('[Engine] Failed to load entrance pipe fallback:', fallbackErr);
                    return null;
                }
            }
        })();
    }
    return pipeModelPromise;
}

let cachedBoatModel = null;
let boatModelPromise = null;

async function getCachedBoatModel(gl) {
    if (cachedBoatModel && cachedBoatModel.isLoaded) {
        return cachedBoatModel;
    }
    if (!boatModelPromise) {
        boatModelPromise = (async () => {
            const loader = window.TarAppLoader || (window.parent && window.parent.TarAppLoader);
            let boatPath = 'entities/boat.gltf';
            if (loader && loader.fileSystem) {
                if (loader.fileSystem['entities/boat.gltf']) boatPath = 'entities/boat.gltf';
                else if (loader.fileSystem['gltf/boat.gltf']) boatPath = 'gltf/boat.gltf';
            }
            const boatUrl = safeResolveUrl(boatPath);
            const model = new GLTFModel(gl);
            try {
                await model.load(boatUrl);
                cachedBoatModel = model;
                return model;
            } catch (err) {
                console.warn(`[Engine] Could not load boat model from '${boatUrl}':`, err);
                return null;
            }
        })();
    }
    return boatModelPromise;
}

async function spawnExitCursors(roomModel) {
    if (!roomModel || !roomModel.exits || roomModel.exits.length === 0) return;
    const cursorModel = await getCachedCursorModel(renderer.gl);
    if (!cursorModel) return;

    const placedPositions = new Set();

    for (const exit of roomModel.exits) {
        // Exclude ocean gates (og_ex__, ex__og__, isOceanGate, ocean transitions)
        const name = (exit.name || '').toLowerCase();
        if (exit.isOceanGate ||
            name.startsWith('og_ex') ||
            name.startsWith('og_en') ||
            name.includes('og__') ||
            name.includes('__og') ||
            (exit.targetRoom && (exit.targetRoom.includes('ocean') || exit.targetRoom.startsWith('og_')))) {
            continue;
        }

        const pos = exit.position || [0, 0, 0];
        const key = `${Math.round(pos[0] * 5)},${Math.round(pos[2] * 5)}`;
        if (placedPositions.has(key)) continue;
        placedPositions.add(key);

        const cursorObj = new GameObject(cursorModel, [1.0, 1.0, 1.0], false, false);
        let groundY = pos[1];
        if (window.CollisionWorld && typeof window.CollisionWorld.getGroundHeight === 'function') {
            const h = window.CollisionWorld.getGroundHeight(pos[0], pos[2], pos[1], 1.0, 5.0);
            if (h !== null && h !== undefined && !isNaN(h) && Math.abs(h - pos[1]) < 8.0) {
                groundY = h;
            }
        }
        cursorObj.position = [pos[0], groundY, pos[2]];

        if (exit.rotationY !== undefined && exit.rotationY !== 0) {
            cursorObj.rotationY = exit.rotationY;
        } else {
            // Point cursor front toward center of room
            cursorObj.rotationY = Math.atan2(-pos[0], -pos[2]);
        }

        cursorObj.name = `CURSOR_${exit.targetRoom || 'EXIT'}`.toUpperCase();
        cursorObj.isInteractable = false;
        cursorObj.visible = true;
        renderer.addEntity(cursorObj);

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { tag: 'OK', message: `Spawned Tricurse Cursor for '${exit.targetRoom || exit.name}' at (${cursorObj.position.map(v => v.toFixed(1)).join(', ')})` });
        }
    }
}

async function spawnEntrancePipes(roomModel) {
    if (!roomModel || !roomModel.entrances) return;
    const pipeModel = await getCachedPipeModel(renderer.gl);
    if (!pipeModel) return;

    const entrances = (roomModel.entranceList && roomModel.entranceList.length > 0)
        ? roomModel.entranceList
        : Object.values(roomModel.entrances);

    const placedPositions = new Set();

    for (const ent of entrances) {
        if (!ent || !ent.position) continue;
        const name = (ent.name || '').toLowerCase();
        if (ent.isOceanGate ||
            name.startsWith('og_en') ||
            name.startsWith('og_ex') ||
            name.includes('og__') ||
            name.includes('__og') ||
            (ent.room && ent.room.includes('ocean'))) {
            continue;
        }

        const pos = ent.position;
        const key = `${Math.round(pos[0] * 5)},${Math.round(pos[2] * 5)}`;
        if (placedPositions.has(key)) continue;
        placedPositions.add(key);

        const pipeObj = new GameObject(pipeModel, [1.0, 1.0, 1.0], false, false);
        let groundY = 0.0;
        if (window.CollisionWorld && typeof window.CollisionWorld.getGroundHeight === 'function') {
            const h = window.CollisionWorld.getGroundHeight(pos[0], pos[2], 0.0, 1.0, 5.0);
            if (h !== null && h !== undefined && !isNaN(h) && Math.abs(h) < 8.0) {
                groundY = h;
            }
        }
        pipeObj.position = [pos[0], groundY, pos[2]];

        const baseRot = (ent.rotationY !== undefined) ? ent.rotationY : 0.0;
        pipeObj.rotationY = baseRot;

        pipeObj.name = `PIPE_${ent.room || ent.name || 'ENTRANCE'}`.toUpperCase();
        pipeObj.isInteractable = false;
        pipeObj.visible = true;
        renderer.addEntity(pipeObj);

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { tag: 'OK', message: `Spawned Entrance Pipe for '${ent.room || ent.name}' at (${pipeObj.position.map(v => v.toFixed(1)).join(', ')})` });
        }
    }
}

async function loadRoom(targetRoomName, sourceRoomName = null, preservePosition = false, customPosition = null, isOceanGate = false) {
    if (isTransitioning) return;
    isTransitioning = true;

    if (window.resolveCanonicalRoom) {
        targetRoomName = window.resolveCanonicalRoom(targetRoomName);
        if (sourceRoomName) sourceRoomName = window.resolveCanonicalRoom(sourceRoomName);
    }

    // Sub-room & Hyperlink Parameter Resolution:
    // Enables rooms to be split into sub-rooms that are technically part of the bigger room.
    // Can be accessed with an additional parameter on ex__ and en__ nodes (like a directory accessing a file).
    // The final, destination room has .gltf appended to it.
    let roomParts = [];
    if (typeof targetRoomName === 'string') {
        if (targetRoomName.includes('/')) {
            roomParts = targetRoomName.split('/').filter(Boolean);
        } else if (targetRoomName.includes('__')) {
            roomParts = targetRoomName.split('__').filter(Boolean);
        } else {
            roomParts = [targetRoomName];
        }
    } else {
        roomParts = [String(targetRoomName)];
    }

    const parentRoomName = roomParts.length > 1 ? roomParts[0] : roomParts[0];
    const destinationRoomName = roomParts[roomParts.length - 1];
    const dirPath = roomParts.slice(0, -1).join('/');
    const slashPath = roomParts.join('/');
    const underscorePath = roomParts.join('__');

    const loader = window.TarAppLoader || (window.parent && window.parent.TarAppLoader);

    // Build candidate glTF file paths
    // 1. Directory style: rooms/<dirPath>/<destinationRoom>.gltf
    // 2. Game Title / Category styles:
    //    rooms/Ocarina_of_Time/Overworld/<destinationRoom>.gltf
    //    rooms/Ocarina_of_Time/Temples/<destinationRoom>.gltf
    //    rooms/Ocarina_of_Time/Child_Link_Dungeons/<destinationRoom>.gltf
    //    rooms/Ocean_and_Hubs/<destinationRoom>.gltf
    // 3. Inner room nested style:
    //    rooms/Ocarina_of_Time/Overworld/<dirPath>/<destinationRoom>.gltf
    // 4. Parameter style & legacy fallbacks
    const candidates = [];
    if (roomParts.length > 1) {
        candidates.push(`rooms/${dirPath}/${destinationRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Overworld/${dirPath}/${destinationRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Temples/${dirPath}/${destinationRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Child_Link_Dungeons/${dirPath}/${destinationRoomName}.gltf`);
        candidates.push(`rooms/${underscorePath}.gltf`);
        candidates.push(`rooms/${destinationRoomName}.gltf`);
        candidates.push(`rooms/${parentRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Overworld/${parentRoomName}.gltf`);
        candidates.push(`light/${dirPath}/${destinationRoomName}.gltf`);
        candidates.push(`light/${underscorePath}.gltf`);
        candidates.push(`light/${destinationRoomName}.gltf`);
        candidates.push(`light/${parentRoomName}.gltf`);
    } else {
        candidates.push(`rooms/${targetRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Overworld/${targetRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Temples/${targetRoomName}.gltf`);
        candidates.push(`rooms/Ocarina_of_Time/Child_Link_Dungeons/${targetRoomName}.gltf`);
        candidates.push(`rooms/Ocean_and_Hubs/${targetRoomName}.gltf`);
        candidates.push(`light/${targetRoomName}.gltf`);
    }

    let gltfPath = candidates[0];
    let isAnchorOnly = false;

    if (loader && loader.fileSystem) {
        let found = false;
        for (const cand of candidates) {
            const clean = cand.replace(/^\.\//, '').replace(/^\//, '');
            if (loader.fileSystem[clean]) {
                gltfPath = cand;
                found = true;
                if ((cand.endsWith(`/${parentRoomName}.gltf`) || cand === `rooms/${parentRoomName}.gltf` || cand === `light/${parentRoomName}.gltf`) && roomParts.length > 1) {
                    isAnchorOnly = true;
                }
                break;
            }
        }
        if (!found) {
            // General filesystem search across rooms/
            const targetSuffix = `/${destinationRoomName}.gltf`;
            const slashSuffix = `/${slashPath}.gltf`;
            for (const key of Object.keys(loader.fileSystem)) {
                if (!key.startsWith('rooms/') && !key.startsWith('light/')) continue;
                if (key.endsWith(slashSuffix) || key.endsWith(targetSuffix)) {
                    gltfPath = key;
                    found = true;
                    break;
                }
            }
        }
        if (!found && roomParts.length > 1) {
            // Check gltf/ prefix
            for (const cand of candidates) {
                const alt = cand.replace(/^(rooms|light)\//, 'gltf/');
                const clean = alt.replace(/^\.\//, '').replace(/^\//, '');
                if (loader.fileSystem[clean]) {
                    gltfPath = alt;
                    found = true;
                    if (alt.endsWith(`/${parentRoomName}.gltf`) && roomParts.length > 1) {
                        isAnchorOnly = true;
                    }
                    break;
                }
            }
        }
    }

    const gs = window.GameState;
    if (gs) {
        gs.currentDimension = 'LIGHT';
        gs.isOpenSea = false;
    }

    let resolvedPath = safeResolveUrl(gltfPath);
    let roomModel = new GLTFModel(renderer.gl);

    if (typeof window.EventBus !== 'undefined') {
        window.EventBus.emit('log:entry', { tag: 'INFO', message: `Loading room '${gltfPath}' (Parent: '${parentRoomName}', Sub-room: '${destinationRoomName}')...` });
    }

    try {
        try {
            await roomModel.load(resolvedPath);
        } catch (loadErr) {
            console.warn(`[Engine] Could not load '${resolvedPath}', attempting fallback candidates...`, loadErr);
            let loaded = false;
            for (let i = 1; i < candidates.length; i++) {
                const altPath = candidates[i];
                try {
                    resolvedPath = safeResolveUrl(altPath);
                    roomModel = new GLTFModel(renderer.gl);
                    await roomModel.load(resolvedPath);
                    gltfPath = altPath;
                    loaded = true;
                    if (altPath === `rooms/${parentRoomName}.gltf` || altPath === `light/${parentRoomName}.gltf`) isAnchorOnly = true;
                    break;
                } catch (e) {
                    // Try gltf/ folder as well
                    try {
                        const altGltf = altPath.replace(/^(rooms|light)\//, 'gltf/');
                        resolvedPath = safeResolveUrl(altGltf);
                        roomModel = new GLTFModel(renderer.gl);
                        await roomModel.load(resolvedPath);
                        gltfPath = altGltf;
                        loaded = true;
                        if (altGltf === `gltf/${parentRoomName}.gltf`) isAnchorOnly = true;
                        break;
                    } catch (e2) {}
                }
            }
            if (!loaded) {
                throw new Error(`Failed to load room glTF from any candidate: ${candidates.join(', ')}`);
            }
        }

        if (worldEntity) {
            const idx = renderer.gameObjects.indexOf(worldEntity);
            if (idx !== -1) renderer.gameObjects.splice(idx, 1);
        }

        renderer.gameObjects = renderer.gameObjects.filter(obj => obj === characterEntity);

        worldEntity = new GameObject(roomModel, [1.0, 1.0, 1.0], false, false);
        worldEntity.visible = true;
        renderer.addEntity(worldEntity);
        currentRoomName = isAnchorOnly ? parentRoomName : slashPath;

        const isSubRoom = (roomParts.length > 1 && !isAnchorOnly);
        worldEntity.parentRoom = parentRoomName;
        worldEntity.subRoom = destinationRoomName;
        worldEntity.isSubRoom = isSubRoom;

        if (window.CollisionWorld) {
            window.CollisionWorld.setWorldEntity(worldEntity);
        }

        if (window.GameState) {
            window.GameState.worldEntity = worldEntity;
            window.GameState.gameObjects = renderer.gameObjects;
            window.GameState.currentRoom = currentRoomName;
            window.GameState.parentRoom = parentRoomName;
            window.GameState.subRoom = destinationRoomName;
            window.GameState.isSubRoom = isSubRoom;
            window.GameState.currentDimension = 'LIGHT';
            window.GameState.isOpenSea = false;
        }

        // Configure water surface rendering for sea & water rooms
        const targetLower = String(targetRoomName).toLowerCase();
        const isWaterRoom = targetLower.includes('links_house') ||
                            targetLower.includes('world') ||
                            targetLower.includes('ocean') ||
                            targetLower.includes('open_sea') ||
                            (window.ROOM_COORDINATES && window.ROOM_COORDINATES[targetRoomName] && window.ROOM_COORDINATES[targetRoomName].atSea);

        if (renderer) {
            renderer.waterEnabled = !!isWaterRoom;
            renderer.waterElevation = targetLower.includes('links_house') ? -0.06 : 0.0;
        }

        // Hyperlink & Entrance Matching for Rooms and Sub-rooms
        let entranceNode = null;

        // 1. Direct sub-room / anchor match
        if (roomParts.length > 1 && roomModel.entrances) {
            entranceNode = roomModel.entrances[destinationRoomName]
                || roomModel.entrances[slashPath]
                || roomModel.entrances[underscorePath]
                || roomModel.entrances[`en_l__${destinationRoomName}`]
                || roomModel.entrances[`en_l__${slashPath}`]
                || roomModel.entrances[`en_l__${underscorePath}`]
                || roomModel.entrances[`${parentRoomName}__${destinationRoomName}`];
        }

        // 2. Default Room Entrance for sub-room or directory
        if (!entranceNode && roomModel.entrances) {
            entranceNode = roomModel.entrances[`en__${currentRoomName}`]
                || roomModel.entrances[`en_l__${currentRoomName}`]
                || roomModel.entrances[`${currentRoomName}__default`]
                || roomModel.entrances[`${destinationRoomName}__default`]
                || roomModel.entrances['default'];
        }

        // 3. Source-Coupled Handshake Fallback (e.g. en_l__<sourceRoomName>)
        if (!entranceNode && sourceRoomName && roomModel.entrances) {
            const cleanSource = sourceRoomName.split('/').pop().split('__').pop();
            entranceNode = roomModel.entrances[`og_en__${sourceRoomName}`]
                || roomModel.entrances[`og_en_l__${sourceRoomName}`]
                || roomModel.entrances[`en_l__${sourceRoomName}`]
                || roomModel.entrances[`en__${sourceRoomName}`]
                || roomModel.entrances[sourceRoomName]
                || roomModel.entrances[`en_l__${cleanSource}`]
                || roomModel.entrances[cleanSource]
                || roomModel.entrances[`og_en__${currentRoomName}`]
                || roomModel.entrances[`en_l__${currentRoomName}`]
                || roomModel.entrances[currentRoomName];
        }

        // 4. First available entrance fallback
        if (!entranceNode && !preservePosition && !customPosition && roomModel.entrances) {
            const firstEnt = (roomModel.entranceList && roomModel.entranceList[0])
                || roomModel.entrances[Object.keys(roomModel.entrances)[0]];
            if (firstEnt) entranceNode = firstEnt;
        }

        if (customPosition && characterEntity) {
            characterEntity.position[0] = Math.round(customPosition[0] * 10) / 10;
            characterEntity.position[1] = Math.round(customPosition[1] * 10) / 10;
            characterEntity.position[2] = Math.round(customPosition[2] * 10) / 10;
        } else if (preservePosition && characterEntity) {
            characterEntity.position[0] = Math.round(characterEntity.position[0] * 10) / 10;
            characterEntity.position[2] = Math.round(characterEntity.position[2] * 10) / 10;
            if (window.CollisionWorld) {
                const groundY = window.CollisionWorld.getGroundHeight(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], 10.0, 500.0);
                if (groundY !== null) characterEntity.position[1] = Math.round(groundY * 10) / 10;
            }
        } else if (entranceNode && characterEntity) {
            characterEntity.position[0] = Math.round(entranceNode.position[0] * 10) / 10;
            characterEntity.position[1] = Math.round(entranceNode.position[1] * 10) / 10;
            characterEntity.position[2] = Math.round(entranceNode.position[2] * 10) / 10;

            // Invert entrance orientation (+ 180 deg / Math.PI) so the player faces forward into the room instead of back at the entrance door
            const baseRot = entranceNode.rotationY !== undefined ? entranceNode.rotationY : 0.0;
            characterEntity.rotationY = Math.atan2(Math.sin(baseRot + Math.PI), Math.cos(baseRot + Math.PI));
            
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', { 
                    tag: 'OK', 
                    message: `Entrance handshake matched for '${sourceRoomName}' at (${entranceNode.position.join(', ')})` 
                });
            }
        } else if (characterEntity && window.CollisionWorld) {
            const groundY = window.CollisionWorld.getGroundHeight(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], 10.0, 500.0) || 0.0;
            characterEntity.position[1] = Math.round(groundY * 10) / 10;
        }

        // Pickups
        if (roomModel.pickups && roomModel.pickups.length > 0) {
            for (const pickupData of roomModel.pickups) {
                const potObject = new GameObject(pickupData.model, [0.85, 0.45, 0.25], false, true);
                potObject.position = [...pickupData.position];
                if (pickupData.rotationY !== undefined) {
                    potObject.rotationY = pickupData.rotationY;
                }
                potObject.isInteractable = true;
                potObject.name = pickupData.name.toUpperCase();
                if (potObject.name === 'BOAT' || potObject.name === 'SPEEDBOAT') {
                    potObject.isVehicle = true;
                }
                renderer.addEntity(potObject);

                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('log:entry', { tag: 'OK', message: `Spawned interactable ${potObject.isVehicle ? 'vehicle' : 'pickup'} '${potObject.name}' at (${potObject.position.join(', ')})` });
                }
            }
        }

        // Spawn overhead Tricurse Cursors at all exit hyperlinks (ex__ nodes)
        try {
            await spawnExitCursors(roomModel);
        } catch (cursorErr) {
            console.warn('[Engine] Failed to spawn exit cursors:', cursorErr);
        }

        // Spawn overhead Entrance Pipes at all room entrances (en__ nodes)
        try {
            await spawnEntrancePipes(roomModel);
        } catch (pipeErr) {
            console.warn('[Engine] Failed to spawn entrance pipes:', pipeErr);
        }

        // Spawn docked boat near Link's House if in links_house
        if (targetLower.includes('links_house')) {
            const hasBoat = renderer.gameObjects.some(e => e.isVehicle || e.name === 'BOAT' || e.name === 'SPEEDBOAT');
            if (!hasBoat) {
                try {
                    const boatModel = await getCachedBoatModel(renderer.gl);
                    if (boatModel) {
                        const boatObj = new GameObject(boatModel, [1.0, 1.0, 1.0], false, true);
                        // Docked in the water alongside the entrance porch
                        boatObj.position = [2.2, -0.15, 6.8];
                        boatObj.rotationY = Math.PI; // Heading outward to open water
                        boatObj.name = 'BOAT';
                        boatObj.isInteractable = true;
                        boatObj.isVehicle = true;
                        renderer.addEntity(boatObj);
                        if (typeof window.EventBus !== 'undefined') {
                            window.EventBus.emit('log:entry', { tag: 'OK', message: "Docked speedboat near Link's House at (2.2, -0.15, 6.8)" });
                        }
                    }
                } catch (boatErr) {
                    console.warn('[Engine] Failed to spawn docked boat near links_house:', boatErr);
                }
            }
        }

        // Seamless boat transfer when sailing across ocean room transitions or through ocean gates
        if (isOceanGate || (window.playerPhysicsInstance && (window.playerPhysicsInstance.currentState === 'BOATING' || window.playerPhysicsInstance.currentState === (window.State && window.State.BOATING)))) {
            const list = renderer.gameObjects || renderer.entities || [];
            const boatObj = list.find(e => e.isVehicle || e.name === 'BOAT' || e.name === 'SPEEDBOAT');
            if (boatObj && characterEntity) {
                boatObj.position[0] = characterEntity.position[0];
                boatObj.position[1] = characterEntity.position[1] - 0.35;
                boatObj.position[2] = characterEntity.position[2];
                boatObj.rotationY = characterEntity.rotationY;
                if (window.playerPhysicsInstance) {
                    window.playerPhysicsInstance.mountBoat(characterEntity, boatObj);
                    // Restore boat momentum after crossing ocean gate
                    if (window.GameState && window.GameState.preservedBoatVelocity !== undefined) {
                        window.playerPhysicsInstance.boatVelocity = window.GameState.preservedBoatVelocity;
                        delete window.GameState.preservedBoatVelocity;
                    }
                }
            }
        }

        // Multiplayer & Room Chat Connection Dispatch
        if (window.DarkWorldMultiplayer) {
            if (!window.DarkWorldMultiplayer.isConnected) {
                window.DarkWorldMultiplayer.connect(null, null, 'LIGHT');
            } else {
                window.DarkWorldMultiplayer.notifyRoomChange(targetRoomName, 'LIGHT');
            }
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('room:afterLoad', { roomName: targetRoomName, worldEntity });
            window.EventBus.emit('camera:snapBehind');
            window.EventBus.emit('log:entry', { tag: 'OK', message: `Room '${targetRoomName}' [rooms/] loaded successfully.` });
        }
    } catch (err) {
        console.error(`[Engine Error] Failed to load room '${targetRoomName}' from '${resolvedPath}':`, err);
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { tag: 'WARN', message: `Failed to load room '${targetRoomName}'.` });
        }
    } finally {
        isTransitioning = false;
    }
}

window.loadRoom = loadRoom;
window.loadRoomVariant = function(roomName) {
    loadRoom(roomName, null, true);
};

function checkExitProximity() {
    if (!worldEntity || !worldEntity.model || !characterEntity || isTransitioning) {
        nearbyExit = null;
        if (window.GameState) window.GameState.nearbyExit = null;
        return;
    }

    const isBoating = window.playerPhysicsInstance && (window.playerPhysicsInstance.currentState === 'BOATING' || window.playerPhysicsInstance.currentState === (window.State && window.State.BOATING));

    // 1. Ocean Gate Plane Exits: Instant automatic trigger when touching plane (<= 0.5m)
    // PLAYER MUST BE ON BOAT TO USE OCEAN GATE
    if (worldEntity.model.oceanGateExits && worldEntity.model.oceanGateExits.length > 0) {
        for (let i = 0; i < worldEntity.model.oceanGateExits.length; i++) {
            const og = worldEntity.model.oceanGateExits[i];
            const dist = typeof window.distanceToOceanGatePlane === 'function'
                ? window.distanceToOceanGatePlane(characterEntity.position, og)
                : 999.0;
            if (dist <= 0.5) { // 0.5m required proximity
                if (!isBoating) {
                    // Must be in boat to use ocean gate!
                    continue;
                }
                const curVel = (window.playerPhysicsInstance && window.playerPhysicsInstance.boatVelocity) || 0;
                // Preserve momentum across gate (ensuring brisk cruising speed upon arrival)
                if (window.GameState) {
                    window.GameState.preservedBoatVelocity = Math.max(Math.abs(curVel), 8.5);
                }
                console.log(`[Ocean Gate] Boating through plane '${og.name}' (dist: ${dist.toFixed(3)}m <= 0.5m, momentum: ${window.GameState.preservedBoatVelocity.toFixed(1)}). Warping to '${og.targetRoom}'`);
                loadRoom(og.targetRoom, currentRoomName, false, null, true);
                return;
            }
        }
    }

    const exits = worldEntity.model.exits;
    if (!exits || exits.length === 0) {
        nearbyExit = null;
        if (window.GameState) window.GameState.nearbyExit = null;
        return;
    }

    const px = characterEntity.position[0];
    const py = characterEntity.position[1];
    const pz = characterEntity.position[2];
    let closestExit = null;
    let minDistSq = isBoating ? 64.0 : 4.0;

    for (let i = 0, len = exits.length; i < len; i++) {
        const exitNode = exits[i];
        // Ignore legacy Dark/Side World exits or ocean gate planes already checked above
        if (exitNode.targetDimension === 'd' || exitNode.targetDimension === 's' || exitNode.isOceanGate) continue;

        const dx = px - exitNode.position[0];
        const dy = py - exitNode.position[1];
        const dz = pz - exitNode.position[2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= minDistSq) {
            minDistSq = distSq;
            closestExit = exitNode;
        }
    }

    nearbyExit = closestExit;
    if (window.GameState) window.GameState.nearbyExit = closestExit;
}

let _cachedHudActionSlot = undefined;
let _cachedHudActionText = undefined;

function updateHUDActionText() {
    if (_cachedHudActionSlot === undefined) {
        _cachedHudActionSlot = document.getElementById('hud-action-slot');
        _cachedHudActionText = document.getElementById('hud-action-text');
    }
    if (!_cachedHudActionSlot || !_cachedHudActionText) return;

    const gs = window.GameState;
    const isMenuOpen = gs ? (gs.isItemMenuOpen || gs.isDebugMenuOpen) : (window.isItemMenuOpen || window.isDebugMenuOpen);

    if (isMenuOpen) {
        _cachedHudActionSlot.classList.remove('visible');
        return;
    }

    _cachedHudActionSlot.classList.add('visible');

    const isBoating = gs ? (gs.playerState === 'BOATING' || (window.playerPhysicsInstance && window.playerPhysicsInstance.currentState === 'BOATING')) : false;

    // Check if character is near an ocean gate while not in boat
    let nearOceanGateNotBoating = false;
    if (!isBoating && worldEntity && worldEntity.model && worldEntity.model.oceanGateExits && characterEntity) {
        for (let i = 0; i < worldEntity.model.oceanGateExits.length; i++) {
            const og = worldEntity.model.oceanGateExits[i];
            const dist = typeof window.distanceToOceanGatePlane === 'function'
                ? window.distanceToOceanGatePlane(characterEntity.position, og)
                : 999.0;
            if (dist <= 4.0) {
                nearOceanGateNotBoating = true;
                break;
            }
        }
    }

    if (isBoating) {
        _cachedHudActionText.textContent = "DISEMBARK BOAT";
    } else if (nearOceanGateNotBoating) {
        _cachedHudActionText.textContent = "BOARD BOAT TO USE OCEAN GATE";
    } else if (gs && gs.nearbyInteractable && (gs.nearbyInteractable.isVehicle || gs.nearbyInteractable.name === 'BOAT' || gs.nearbyInteractable.name === 'SPEEDBOAT')) {
        _cachedHudActionText.textContent = "BOARD SPEEDBOAT";
    } else if (gs && gs.heldEntity) {
        _cachedHudActionText.textContent = `DROP ${gs.heldEntity.name}`;
    } else if (gs && gs.nearbyInteractable) {
        _cachedHudActionText.textContent = `PICK UP ${gs.nearbyInteractable.name}`;
    } else if (gs && (gs.playerState === 'FLOATING' || gs.playerState === 'FALLING' || gs.playerState === 'JUMPING')) {
        _cachedHudActionText.textContent = "DESCENT";
    } else if (gs && gs.pendingLedgeAction) {
        const isSwimming = gs.playerState === 'SWIMMING' || (window.playerPhysicsInstance && window.playerPhysicsInstance.currentState === 'SWIMMING');
        _cachedHudActionText.textContent = isSwimming ? "PRESS [K] -> CLIMB ONTO LAND" : (gs.pendingLedgeAction.type === 'MANTLE' ? "CLIMB LEDGE" : "HIGH CLIMB");
    } else if (nearbyExit) {
        if (nearbyExit.isBarExternal && nearbyExit.externalUrl) {
            const cleanUrl = nearbyExit.externalUrl.replace(/^https?:\/\//i, '').replace(/^bar:\/\//i, '').replace(/\/+$/, '');
            _cachedHudActionText.textContent = `CLICK [K] -> WARP: ${cleanUrl.toUpperCase()}`;
        } else {
            let rawTarget = nearbyExit.targetRoom || 'HYPERLINK';
            if (window.resolveCanonicalRoom) rawTarget = window.resolveCanonicalRoom(rawTarget);
            const cleanName = rawTarget.includes('/')
                ? rawTarget.split('/').map(s => s.toUpperCase().replace(/_/g, ' ')).join(' / ')
                : rawTarget.toUpperCase().replace(/__/g, ' / ').replace(/_/g, ' ');
            _cachedHudActionText.textContent = `CLICK [K] -> ${cleanName}`;
        }
    } else {
        _cachedHudActionText.textContent = "INTERACT";
    }
}

function updateSeaCoordinatesHUD() {
    const el = document.getElementById('sea-coordinates-hud');
    if (!el) return;

    const gs = window.GameState;
    const char = gs ? gs.characterEntity : null;
    const phys = window.playerPhysicsInstance;
    if (!char || !phys) {
        el.classList.add('hidden');
        return;
    }

    const isBoating = phys.currentState === window.State.BOATING;
    const isSwimming = phys.currentState === window.State.SWIMMING;
    const distFromOrigin = Math.hypot(char.position[0], char.position[2]);
    const isAtSea = isBoating || isSwimming || distFromOrigin > 35.0 || (gs && gs.isOpenSea);

    // Only sea-capable rooms have nautical coordinates and open sea transitions
    if (currentRoomName === 'vow_3' || currentRoomName === 'vow_4') {
        el.classList.add('hidden');
        return;
    }

    if (!isAtSea) {
        el.classList.add('hidden');
        return;
    }

    const roomDef = (window.ROOM_COORDINATES && window.ROOM_COORDINATES[currentRoomName])
        || { x: 0.0, z: 0.0, name: currentRoomName.toUpperCase().replace('_', ' '), seaRadius: 200.0, atSea: false };

    if (roomDef.atSea === false && !gs.isOpenSea) {
        el.classList.add('hidden');
        return;
    }

    el.classList.remove('hidden');

    // Calculate global nautical coordinates
    const globalX = (gs && gs.isOpenSea) ? char.position[0] : (char.position[0] + roomDef.x);
    const globalZ = (gs && gs.isOpenSea) ? char.position[2] : (char.position[2] + roomDef.z);

    // 1 world unit = 0.1 nautical miles (6 minutes of arc)
    const rawLat = -globalZ * 0.1;
    const rawLon =  globalX * 0.1;

    // Wrap degrees modulo 360 so LAT and LON never exceed 359 degrees
    const totalLatDeg = Math.floor(Math.abs(rawLat));
    const latMin = ((Math.abs(rawLat) - totalLatDeg) * 60).toFixed(1).padStart(4, '0');
    const latDeg = ((totalLatDeg % 360) + 360) % 360;
    const latDir = rawLat >= 0 ? 'N' : 'S';

    const totalLonDeg = Math.floor(Math.abs(rawLon));
    const lonMin = ((Math.abs(rawLon) - totalLonDeg) * 60).toFixed(1).padStart(4, '0');
    const lonDeg = ((totalLonDeg % 360) + 360) % 360;
    const lonDir = rawLon >= 0 ? 'E' : 'W';

    const deg = Math.round(((-char.rotationY * 180 / Math.PI) % 360 + 360) % 360);
    const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const compassIdx = Math.round(deg / 45) % 8;
    const compassDir = compassPoints[compassIdx];

    let speedKts = 0.0;
    if (isBoating) {
        speedKts = Math.abs((phys.boatVelocity || 0) * 1.944);
    } else if (isSwimming) {
        speedKts = (phys.swimSpeed || 5.0) * 1.944;
    }

    // Determine location and water type by querying mesh directly beneath character
    let locName = roomDef.name || "TEMPLE HARBOR";
    const groundHit = (window.CollisionWorld && typeof window.CollisionWorld.checkMeshBeneath === 'function')
        ? window.CollisionWorld.checkMeshBeneath(char.position[0], char.position[2], char.position[1])
        : null;

    const maxTerritoryRadius = roomDef.seaRadius || 200.0;

    if (!gs.isOpenSea) {
        if (groundHit) {
            locName = groundHit.isCoastal ? "COASTAL EXPANSE" : (roomDef.name || currentRoomName.toUpperCase().replace('_', ' '));
            if (worldEntity) worldEntity.visible = true;
        } else {
            // No mesh beneath character: in local waters or venturing into Open Sea
            if (distFromOrigin > maxTerritoryRadius) {
                // Ventured beyond territorial waters of current room into Open Sea
                console.log(`[Open Sea Transition] Venturing beyond territorial waters (${distFromOrigin.toFixed(1)}m > ${maxTerritoryRadius}m) into Open Sea from '${currentRoomName}'.`);
                gs.isOpenSea = true;
                if (worldEntity) worldEntity.visible = false;
                const deltaX = globalX - char.position[0];
                const deltaZ = globalZ - char.position[2];
                char.position[0] = globalX;
                char.position[2] = globalZ;
                if (phys.activeVehicle) {
                    phys.activeVehicle.position[0] = globalX;
                    phys.activeVehicle.position[2] = globalZ;
                }
                if (window.cameraControllerInstance && window.cameraControllerInstance.camPos) {
                    window.cameraControllerInstance.camPos[0] += deltaX;
                    window.cameraControllerInstance.camPos[2] += deltaZ;
                }
                currentRoomName = 'open_sea';
                gs.currentRoom = 'open_sea';
                locName = "OPEN SEA - UNCHARTED";
            } else {
                // In local room's territorial waters (e.g. swimming in harbor/sea around island)
                locName = roomDef.name ? `${roomDef.name} WATERS` : "TEMPLE HARBOR";
                if (worldEntity) worldEntity.visible = true;
            }
        }
    } else {
        // While navigating Open Sea, check proximity to registered rooms at their actual coordinates
        locName = "OPEN SEA - UNCHARTED";

        if (window.ROOM_COORDINATES && !isTransitioning) {
            for (const [rKey, rInfo] of Object.entries(window.ROOM_COORDINATES)) {
                if (rInfo.atSea === false) continue;
                const distToRoom = Math.hypot(globalX - rInfo.x, globalZ - rInfo.z);
                if (distToRoom <= (rInfo.seaRadius || 180.0)) {
                    console.log(`[Open Sea Arrival] Approached room '${rKey}' at sea (dist: ${distToRoom.toFixed(1)}m <= ${rInfo.seaRadius}m). Loading room.`);
                    gs.isOpenSea = false;
                    const localX = globalX - rInfo.x;
                    const localZ = globalZ - rInfo.z;
                    const localY = isSwimming ? -0.15 : (isBoating ? 0.2 : 0.0);
                    loadRoom(rKey, 'open_sea', false, [localX, localY, localZ]);
                    break;
                }
            }
        }
    }

    const locEl = document.getElementById('sea-coords-location');
    const latEl = document.getElementById('sea-coords-lat');
    const lonEl = document.getElementById('sea-coords-lon');
    const hdgEl = document.getElementById('sea-coords-hdg');
    const spdEl = document.getElementById('sea-coords-spd');

    if (locEl) locEl.textContent = locName;
    if (latEl) latEl.textContent = `${latDeg}° ${latMin}' ${latDir}`;
    if (lonEl) lonEl.textContent = `${lonDeg}° ${lonMin}' ${lonDir}`;
    if (hdgEl) hdgEl.textContent = `${deg.toString().padStart(3, '0')}° ${compassDir}`;
    if (spdEl) spdEl.textContent = `${speedKts.toFixed(1)} KTS`;
}

function setupGameLoop() {
    let lastTime = performance.now();
    let frameCount = 0, currentFps = 60, fpsTimer = 0.0;
    const tickPayload = { dt: 0.016, currentTime: 0, currentFps: 60 };
    const renderPayload = { renderer: null };

    function gameLoop(currentTime) {
        const dt = Math.min(0.1, (currentTime - lastTime) / 1000.0);
        lastTime = currentTime;

        frameCount++;
        fpsTimer += dt;
        if (fpsTimer >= 1.0) {
            currentFps = frameCount;
            frameCount = 0;
            fpsTimer = 0.0;
        }

        checkExitProximity();
        updateHUDActionText();
        updateSeaCoordinatesHUD();

        if (window.EventBus) {
            tickPayload.dt = dt;
            tickPayload.currentTime = currentTime;
            tickPayload.currentFps = currentFps;
            renderPayload.renderer = renderer;

            // PHASE 1: Poll Raw Controls & Handle UI Latches
            window.EventBus.emit('engine:input', tickPayload);

            // PHASE 2: Physics Calculations & Character Position Resolution
            window.EventBus.emit('engine:physics', tickPayload);

            // PHASE 3: Camera Matrix Calculation & Positioning (Reads Final Player Transform)
            window.EventBus.emit('engine:camera', tickPayload);

            // PHASE 4: WebGL Scene Draw (Matrices & Transforms Synchronized)
            window.EventBus.emit('engine:render', renderPayload);
        }

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

let _cachedScreenContainer = null;
let _cachedViewWidth = 0;
let _cachedViewHeight = 0;
window.addEventListener('resize', () => {
    _cachedViewWidth = 0;
    _cachedViewHeight = 0;
});

/**
 * Projects a 3D world coordinate (X, Y, Z) to 2D canvas pixel coordinates (screenX, screenY).
 */
function project3DWorldToScreen(px, py, pz) {
    if (typeof renderer === 'undefined' || !renderer || !renderer.canvas || !renderer.viewMatrix || !renderer.projMatrix) return null;
    const v = renderer.viewMatrix;
    const p = renderer.projMatrix;

    // 1. Transform world coordinates to camera space
    const vx = px * v[0] + py * v[4] + pz * v[8] + v[12];
    const vy = px * v[1] + py * v[5] + pz * v[9] + v[13];
    const vz = px * v[2] + py * v[6] + pz * v[10] + v[14];
    const vw = px * v[3] + py * v[7] + pz * v[11] + v[15];

    // 2. Transform camera space to clip space
    const clipX = vx * p[0] + vy * p[4] + vz * p[8] + vw * p[12];
    const clipY = vx * p[1] + vy * p[5] + vz * p[9] + vw * p[13];
    const clipW = vx * p[3] + vy * p[7] + vz * p[11] + vw * p[15];

    if (clipW <= 0.05) return null;

    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;

    if (!_cachedViewWidth || !_cachedViewHeight) {
        if (!_cachedScreenContainer) {
            _cachedScreenContainer = document.getElementById('game-screen-container') || renderer.canvas;
        }
        _cachedViewWidth = (_cachedScreenContainer && _cachedScreenContainer.clientWidth) || renderer.canvas.width;
        _cachedViewHeight = (_cachedScreenContainer && _cachedScreenContainer.clientHeight) || renderer.canvas.height;
    }

    const screenX = (ndcX * 0.5 + 0.5) * _cachedViewWidth;
    const screenY = (0.5 - ndcY * 0.5) * _cachedViewHeight;

    return { x: screenX, y: screenY };
}
window.project3DWorldToScreen = project3DWorldToScreen;

function safeResolveUrl(path) {
    if (typeof window.resolveUrl === 'function' && window.resolveUrl !== safeResolveUrl) {
        return window.resolveUrl(path);
    }
    return path;
}
