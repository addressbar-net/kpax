// Dark World Real-Time Multiplayer WebSocket Client
// Subscribes to 0.1-length increment movement events and renders remote players in WebGL.

class DarkWorldMultiplayerClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.myPlayerId = null;

        // Map: playerId -> { id, username, entity, badgeEl, targetX, targetY, targetZ, rotationY }
        this.remotePlayers = new Map();

        this.lastSentState = null;
        this.lastSendTimestamp = 0;
        this.sendIntervalMs = 50; // Max 20 packets/sec for smooth network sync

        this.nametagContainer = null;
        this.remoteModelCache = null;
        this.currentRoom = 'world';

        this.bindEventBus();
        this.initAuthCheck();
    }

    bindEventBus() {
        if (typeof window.EventBus === 'undefined') return;

        // Phase 2: Send position updates if moved in Light World (3D rooms)
        window.EventBus.on('engine:physics', () => {
            const gs = window.GameState;
            if (!gs || !this.isConnected || !gs.characterEntity) return;

            this.sendLocalUpdate(gs.characterEntity);
        });

        // Phase 3: Interpolate remote players and project nametags
        window.EventBus.on('engine:camera', (payload) => {
            if (this.remotePlayers.size > 0) {
                const dt = (payload && typeof payload.dt === 'number') ? payload.dt : 0.016;
                this.interpolateRemotePlayers(dt);
                this.updateNametagPositions();
            }
        });

        // Ensure remote players are kept in renderer and synchronized when rooms finish loading
        window.EventBus.on('room:afterLoad', (data) => {
            const targetRoom = (data && data.roomName) || (window.GameState && window.GameState.currentRoom) || 'world';
            this.currentRoom = targetRoom;
            this.notifyRoomChange(targetRoom);
            this.syncRemotePlayersForRoom(targetRoom);
            if (window.GameState && window.GameState.characterEntity) {
                this.sendLocalUpdate(window.GameState.characterEntity, true);
            }
        });

        // Re-send update when player toggles name visibility in chat
        window.EventBus.on('chat:nameToggled', (data) => {
            const isHidden = (data && data.hideName !== undefined)
                ? !!data.hideName
                : ((localStorage.getItem('dw_hide_player_name') === 'true') || (window.ChatUI && window.ChatUI.hidePlayerName));
            if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'toggle_name',
                    hideName: isHidden
                }));
            }
            const gs = window.GameState;
            if (this.isConnected && gs && gs.characterEntity) {
                this.sendLocalUpdate(gs.characterEntity, true);
            }
            this.updateNametagPositions();
        });

        // Dynamic in-game authentication sync without redirect
        window.EventBus.on('auth:login', (user) => {
            this.updateUserIdentity(user);
        });
        window.EventBus.on('auth:logout', () => {
            this.updateUserIdentity({ authenticated: false, username: '?' });
        });
    }

    /**
     * Updates local player identity in real-time when signing in or out in-game without reconnecting.
     */
    updateUserIdentity(newUser) {
        if (!newUser) return;
        const requestedUser = String(newUser.username || '?').trim().slice(0, 13);
        const token = newUser.token || this.getCookie('session_token') || '';

        window.currentUser = {
            authenticated: !!newUser.authenticated && requestedUser !== '?',
            username: requestedUser,
            token: token
        };
        if (window.GameState) {
            window.GameState.currentUser = window.currentUser;
        }

        if (this.socket && this.isConnected) {
            const gs = window.GameState;
            const char = gs ? gs.characterEntity : null;
            const coords = char ? {
                x: Math.round((Number(char.position[0]) || 0) * 10) / 10,
                y: Math.round((Number(char.position[1]) || 0) * 10) / 10,
                z: Math.round((Number(char.position[2]) || 0) * 10) / 10,
                rotationY: Math.round((Number(char.rotationY) || 0) * 100) / 100
            } : { x: 0, y: 0, z: -2.5, rotationY: 0 };

            const isHidden = (localStorage.getItem('dw_hide_player_name') === 'true') || 
                (window.ChatUI && window.ChatUI.hidePlayerName);

            this.socket.send(JSON.stringify({
                type: 'join',
                username: requestedUser,
                dimension: this.currentDimension || 'LIGHT',
                room: this.currentRoom || 'world',
                x: coords.x,
                y: coords.y,
                z: coords.z,
                rotationY: coords.rotationY,
                hideName: !!isHidden
            }));

            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', { 
                    tag: 'NET', 
                    message: `Multiplayer identity synchronized to '${requestedUser}'.` 
                });
            }
        }
    }

    /**
     * Reads a cookie by name from document.cookie or parent window.
     */
    getCookie(name) {
        try {
            const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
            if (match && match[1]) return decodeURIComponent(match[1]);
        } catch (e) {}
        try {
            if (window.parent && window.parent !== window && window.parent.document) {
                const match = window.parent.document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
                if (match && match[1]) return decodeURIComponent(match[1]);
            }
        } catch (e) {}
        return null;
    }

    /**
     * Initializes or refreshes authentication details from server or local session cookies.
     */
    async initAuthCheck() {
        if (window.currentUser && window.currentUser.authenticated) {
            return;
        }

        // Direct cookie inspection
        const token = this.getCookie('session_token');
        const dwUser = (this.getCookie('dw_user') || this.getCookie('username') || '').slice(0, 13);
        if (token && dwUser) {
            window.currentUser = {
                authenticated: true,
                username: dwUser,
                token: token || ''
            };
            if (window.GameState) {
                window.GameState.currentUser = window.currentUser;
            }
            return;
        }

        try {
            let checkPath = 'auth.php?action=check';
            try {
                const targetHost = this.resolveLoadedHost();
                if (targetHost && targetHost !== window.location.hostname && targetHost !== 'addr.bar') {
                    const isSecure = (window.location.protocol === 'https:' || (window.parentPageUrl && window.parentPageUrl.startsWith('https:')));
                    const protocol = isSecure ? 'https:' : 'http:';
                    checkPath = `${protocol}//${targetHost}/auth.php?action=check`;
                } else {
                    const baseHref = window.parentPageUrl || (window.top && window.top.location && window.top.location.href);
                    if (baseHref && !baseHref.startsWith('about:')) {
                        checkPath = new URL('auth.php?action=check', baseHref).href;
                    }
                }
            } catch (e) {}
            const res = await fetch(checkPath, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.authenticated && data.user) {
                    window.currentUser = {
                        authenticated: true,
                        id: data.user.id,
                        username: String(data.user.username || '').slice(0, 13),
                        email: data.user.email
                    };
                    if (window.GameState) {
                        window.GameState.currentUser = window.currentUser;
                    }
                    return;
                }
            }
        } catch (e) {
            // Silently fail if offline or unauthenticated
        }

        // Default for all players without an account: name is '?'
        window.currentUser = {
            authenticated: false,
            username: '?',
            token: ''
        };
        if (window.GameState) {
            window.GameState.currentUser = window.currentUser;
        }
    }

    /**
     * Resolves the host of the website from where this game was loaded.
     * Respects development site URLs, custom domains, and addr.bar archive origins.
     */
    resolveLoadedHost() {
        // 1. Explicit custom WebSocket URL override if configured
        if (window.DARK_WORLD_WS_URL) {
            try { return new URL(window.DARK_WORLD_WS_URL).hostname; } catch(e) {}
        }

        // 2. Explicitly set targetServerHost / DARK_WORLD_WS_HOST (set by addr.bar, game.php, or instantaneous PAX TAR room switch)
        if (window.targetServerHost && window.targetServerHost !== 'addr.bar') {
            return window.targetServerHost.split(':')[0];
        }
        if (window.DARK_WORLD_WS_HOST && window.DARK_WORLD_WS_HOST !== 'addr.bar') {
            return window.DARK_WORLD_WS_HOST.split(':')[0];
        }

        // 3. Direct browser navigation: if running directly in a standard page (not addr.bar or about:blank/blob)
        try {
            if (window.location && window.location.hostname && 
                window.location.hostname !== 'addr.bar' && 
                !window.location.href.startsWith('blob:') && 
                !window.location.href.startsWith('about:')) {
                return window.location.hostname;
            }
        } catch(e) {}

        // 4. Inspect loadedFromHost / loadedFromUrl injected by archive loader
        if (window.loadedFromHost && window.loadedFromHost !== 'addr.bar') {
            return window.loadedFromHost.split(':')[0];
        }
        if (window.loadedFromUrl) {
            try {
                const u = new URL(window.loadedFromUrl, window.location.href);
                if (u.hostname && u.hostname !== 'addr.bar') return u.hostname;
            } catch(e) {}
        }

        // 5. Inspect parentPageUrl / parentPageOrigin (set by TarAppLoader / iframe wrapper)
        if (window.parentPageUrl) {
            try {
                const u = new URL(window.parentPageUrl);
                if (u.hostname && u.hostname !== 'addr.bar') return u.hostname;
            } catch(e) {}
        }
        if (window.parentPageOrigin) {
            try {
                const u = new URL(window.parentPageOrigin);
                if (u.hostname && u.hostname !== 'addr.bar') return u.hostname;
            } catch(e) {}
        }

        // 6. Inspect parent / top window locations if same-origin and accessible
        try {
            if (window.parent && window.parent !== window && window.parent.location && window.parent.location.hostname) {
                const parentHost = window.parent.location.hostname;
                if (parentHost && parentHost !== 'addr.bar') return parentHost;
            }
        } catch(e) {}
        try {
            if (window.top && window.top !== window && window.top.location && window.top.location.hostname) {
                const topHost = window.top.location.hostname;
                if (topHost && topHost !== 'addr.bar') return topHost;
            }
        } catch(e) {}

        // 7. Inspect document referrer
        try {
            if (document.referrer) {
                const refUrl = new URL(document.referrer);
                if (refUrl.hostname && refUrl.hostname !== 'addr.bar') return refUrl.hostname;
            }
        } catch(e) {}

        // 8. Fallback to current window hostname or localhost
        return window.location.hostname || 'localhost';
    }

    /**
     * Resolves the WebSocket endpoint URL.
     * Uses wss: on HTTPS pages to comply with browser mixed-content security policies.
     * The backend server on port 8080 supports dual HTTP/HTTPS & WS/WSS.
     */
    getWsUrl(forcedProtocol = null) {
        if (window.DARK_WORLD_WS_URL) return window.DARK_WORLD_WS_URL;

        const host = this.resolveLoadedHost();
        const cleanHost = host.split(':')[0];

        let isHttps = false;
        try {
            if (window.location && window.location.protocol === 'https:') isHttps = true;
            else if (window.parentPageUrl && window.parentPageUrl.startsWith('https:')) isHttps = true;
            else if (window.parentPageOrigin && window.parentPageOrigin.startsWith('https:')) isHttps = true;
            else if (window.top && window.top.location && window.top.location.protocol === 'https:') isHttps = true;
            else if (window.parent && window.parent.location && window.parent.location.protocol === 'https:') isHttps = true;
        } catch (e) {}

        const port = window.DARK_WORLD_WS_PORT || 8080;
        const protocol = forcedProtocol || (isHttps ? 'wss:' : 'ws:');

        return `${protocol}//${cleanHost}:${port}`;
    }

    /**
     * Initiates connection to the Dark World WebSocket server with automatic SSL fallback.
     */
    connect(providedUsername = null, forcedProtocol = null, dimension = null) {
        if (this.isConnected) return;

        let user = window.currentUser || (window.GameState ? window.GameState.currentUser : null);
        let username = providedUsername || (user ? user.username : null);

        // Fallback to cookie or unauthenticated identity '?'
        if (!username || !user || !user.authenticated) {
            const dwUser = (this.getCookie('dw_user') || this.getCookie('username') || '').slice(0, 13);
            const token = this.getCookie('session_token');
            if (dwUser && token) {
                username = dwUser;
                window.currentUser = {
                    authenticated: true,
                    username: username,
                    token: token || ''
                };
            } else {
                username = '?';
                window.currentUser = {
                    authenticated: false,
                    username: '?',
                    token: ''
                };
            }

            if (window.GameState) {
                window.GameState.currentUser = window.currentUser;
            }
            user = window.currentUser;
        }

        if (this.isConnecting && !forcedProtocol) return;

        this.currentDimension = 'LIGHT';
        this.isConnecting = true;
        const wsUrl = this.getWsUrl(forcedProtocol);

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { 
                tag: 'NET', 
                message: `Connecting to ${this.currentDimension} multiplayer at ${wsUrl}...` 
            });
        }

        try {
            if (this.socket) {
                try { this.socket.close(); } catch(e) {}
            }
            this.socket = new WebSocket(wsUrl);
        } catch (err) {
            console.error('[Multiplayer Client Error] Failed to open WebSocket:', err);
            this.isConnecting = false;
            return;
        }

        let hasOpened = false;

        this.socket.onopen = () => {
            hasOpened = true;
            this.isConnected = true;
            this.isConnecting = false;

            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', { 
                    tag: 'OK', 
                    message: `Connected to ${this.currentDimension} multiplayer server as '${user.username}'.` 
                });
            }

            const gs = window.GameState;
            const char = gs ? gs.characterEntity : null;
            const coords = char ? {
                x: Math.round((Number(char.position[0]) || 0) * 10) / 10,
                y: Math.round((Number(char.position[1]) || 0) * 10) / 10,
                z: Math.round((Number(char.position[2]) || 0) * 10) / 10,
                rotationY: Math.round((Number(char.rotationY) || 0) * 100) / 100
            } : { x: 0, y: 0, z: -2.5, rotationY: 0 };

            this.currentRoom = (gs && gs.currentRoom) ? gs.currentRoom : 'world';

            const isHidden = (localStorage.getItem('dw_hide_player_name') === 'true') || 
                (window.ChatUI && window.ChatUI.hidePlayerName);

            // Send handshake join packet
            this.socket.send(JSON.stringify({
                type: 'join',
                username: user.username,
                dimension: this.currentDimension,
                room: this.currentRoom,
                x: coords.x,
                y: coords.y,
                z: coords.z,
                rotationY: coords.rotationY,
                hideName: !!isHidden
            }));
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (err) {
                console.warn('[Multiplayer Client] Invalid packet payload from server:', event.data);
            }
        };

        const host = window.location.hostname || 'localhost';
        const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const canFallbackToPlainWs = (window.location.protocol !== 'https:') || isLoopback;

        this.socket.onclose = (event) => {
            const wasConnected = this.isConnected;
            this.isConnected = false;
            this.isConnecting = false;
            this.cleanupRemotePlayers();

            // Only attempt ws: fallback on loopback or plain HTTP; browser forbids ws: from https:// on remote domains
            if (!hasOpened && !forcedProtocol && wsUrl.startsWith('wss:') && canFallbackToPlainWs) {
                console.warn(`[Multiplayer Client] wss:// connection failed before handshake. Attempting ws:// loopback fallback...`);
                setTimeout(() => this.connect(username, 'ws:'), 150);
                return;
            }

            if (wasConnected && typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', { 
                    tag: 'INFO', 
                    message: `Disconnected from Dark World multiplayer server (code: ${event.code}).` 
                });
            }
        };

        this.socket.onerror = (err) => {
            this.isConnecting = false;
            console.warn('[Multiplayer Client] WebSocket connection notice (server may be offline):', err);

            // Only attempt ws: fallback on loopback or plain HTTP
            if (!hasOpened && !forcedProtocol && wsUrl.startsWith('wss:') && canFallbackToPlainWs) {
                console.warn(`[Multiplayer Client] wss:// error encountered. Retrying via ws:// loopback fallback...`);
                try { this.socket.close(); } catch(e) {}
                setTimeout(() => this.connect(username, 'ws:'), 150);
            }
        };
    }

    /**
     * Handles inbound network packets from the WebSocket server.
     */
    handleServerMessage(data) {
        switch (data.type) {
            case 'welcome': {
                this.myPlayerId = data.id;
                this.isRegistered = !!data.isRegistered;
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('chat:user_status', {
                        username: data.username,
                        isRegistered: !!data.isRegistered,
                        minuteCount: data.minuteCount,
                        minuteLimit: data.minuteLimit || 3,
                        hourCount: data.hourCount,
                        hourLimit: data.hourLimit || 45
                    });
                }
                if (Array.isArray(data.players)) {
                    for (const remoteData of data.players) {
                        this.spawnRemotePlayer(remoteData);
                    }
                    this.syncRemotePlayersForRoom(this.currentRoom);
                }
                break;
            }

            case 'room_players': {
                const room = data.room || this.currentRoom;
                if (Array.isArray(data.players)) {
                    for (const p of data.players) {
                        if (p.id === this.myPlayerId) continue;
                        let remote = this.remotePlayers.get(p.id);
                        if (!remote) {
                            this.spawnRemotePlayer({ ...p, room: room });
                        } else {
                            remote.room = room;
                            if (p.dimension) remote.dimension = p.dimension;
                            if (p.x !== undefined) remote.entity.position[0] = Number(p.x);
                            if (p.y !== undefined) remote.entity.position[1] = Number(p.y);
                            if (p.z !== undefined) remote.entity.position[2] = Number(p.z);
                            if (p.rotationY !== undefined) remote.entity.rotationY = Number(p.rotationY);
                            if (p.state) remote.entity.state = p.state;
                        }
                    }
                    this.syncRemotePlayersForRoom(this.currentRoom);
                }
                break;
            }

            case 'player_room_changed': {
                if (data.id === this.myPlayerId) return;
                let remote = this.remotePlayers.get(data.id);
                if (!remote) {
                    this.spawnRemotePlayer(data);
                    remote = this.remotePlayers.get(data.id);
                }
                if (remote) {
                    if (data.username && remote.username !== data.username) {
                        remote.username = data.username;
                        if (remote.badgeEl) {
                            remote.badgeEl.textContent = (data.username === '??') ? '??' : ((data.username === '?') ? '?' : data.username);
                        }
                        if (remote.entity) remote.entity.name = `PLAYER: ${data.username}`;
                    }
                    remote.room = data.room || 'world';
                    if (data.dimension) remote.dimension = data.dimension;
                    if (data.x !== undefined) remote.entity.position[0] = Number(data.x);
                    if (data.y !== undefined) remote.entity.position[1] = Number(data.y);
                    if (data.z !== undefined) remote.entity.position[2] = Number(data.z);
                    if (data.rotationY !== undefined) remote.entity.rotationY = Number(data.rotationY);
                    this.syncRemotePlayersForRoom(this.currentRoom);
                    if (typeof window.EventBus !== 'undefined' && remote.room === this.currentRoom) {
                        window.EventBus.emit('log:entry', { 
                            tag: 'NET', 
                            message: `Player '${remote.username}' entered room '${remote.room}' [${remote.dimension || 'DARK'}].` 
                        });
                    }
                }
                break;
            }

            case 'player_joined': {
                const playerData = data.player || data;
                if (playerData && playerData.id && playerData.id !== this.myPlayerId) {
                    this.spawnRemotePlayer(playerData);
                    this.syncRemotePlayersForRoom(this.currentRoom);
                    if (typeof window.EventBus !== 'undefined' && (!playerData.room || playerData.room === this.currentRoom)) {
                        window.EventBus.emit('log:entry', { 
                            tag: 'NET', 
                            message: `Player '${playerData.username || playerData.id}' joined realm [${playerData.dimension || 'DARK'}].` 
                        });
                        window.EventBus.emit('sfx:play', 'assign');
                    }
                }
                break;
            }

            case 'player_moved': {
                if (data.id === this.myPlayerId) return;
                let remote = this.remotePlayers.get(data.id);
                if (!remote) {
                    this.spawnRemotePlayer(data);
                    remote = this.remotePlayers.get(data.id);
                }
                if (remote && remote.entity) {
                    if (data.username && remote.username !== data.username) {
                        remote.username = data.username;
                        if (remote.badgeEl) {
                            remote.badgeEl.textContent = (data.username === '??') ? '??' : ((data.username === '?') ? '?' : data.username);
                        }
                        if (remote.entity) remote.entity.name = `PLAYER: ${data.username}`;
                    }
                    if (data.room) remote.room = data.room;
                    if (data.dimension) remote.dimension = data.dimension;
                    const activeDim = (window.GameState && window.GameState.currentDimension) || this.currentDimension || 'DARK';
                    const inCurrentRoom = (!remote.room || remote.room === this.currentRoom) && (!remote.dimension || remote.dimension === activeDim);

                    if (inCurrentRoom) {
                        if (typeof renderer !== 'undefined' && renderer && renderer.gameObjects && !renderer.gameObjects.includes(remote.entity)) {
                            renderer.addEntity(remote.entity);
                        }
                        if (remote.badgeEl) remote.badgeEl.style.display = 'block';
                    } else {
                        if (typeof renderer !== 'undefined' && renderer && renderer.gameObjects) {
                            const idx = renderer.gameObjects.indexOf(remote.entity);
                            if (idx !== -1) renderer.gameObjects.splice(idx, 1);
                        }
                        if (remote.badgeEl) remote.badgeEl.style.display = 'none';
                    }

                    const targetX = Math.round((Number(data.x) || 0) * 10) / 10;
                    const fallbackZ = (remote.targetZ !== undefined) ? remote.targetZ : remote.entity.position[2];
                    const targetZ = Math.round(((data.z !== undefined && data.z !== null) ? Number(data.z) : fallbackZ) * 10) / 10;
                    let targetY = Number(data.y) || 0;
                    if (inCurrentRoom && window.CollisionWorld && typeof window.CollisionWorld.getGroundHeight === 'function') {
                        const groundY = window.CollisionWorld.getGroundHeight(
                            targetX,
                            targetZ,
                            targetY,
                            0.4,
                            500.0
                        );
                        if (groundY !== null && !isNaN(groundY)) {
                            targetY = Math.max(targetY, groundY);
                        }
                    }
                    targetY = Math.round(targetY * 10) / 10;
                    const targetRotY = Number(data.rotationY) || 0;

                    remote.targetX = targetX;
                    remote.targetY = targetY;
                    remote.targetZ = targetZ;
                    remote.targetRotY = targetRotY;
                    if (data.state) remote.entity.state = data.state;

                    // If remote entity was just spawned or is very far away (> 6.0m warp/teleport), snap immediately
                    const distToTarget = Math.hypot(targetX - remote.entity.position[0], targetZ - remote.entity.position[2]);
                    if (distToTarget > 6.0) {
                        remote.entity.position[0] = targetX;
                        remote.entity.position[1] = targetY;
                        remote.entity.position[2] = targetZ;
                        remote.entity.rotationY = targetRotY;
                        remote.smoothedSpeed = 0.0;
                    }
                }
                break;
            }

            case 'player_left': {
                this.removeRemotePlayer(data.id);
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('log:entry', { 
                        tag: 'NET', 
                        message: `Player '${data.username || data.id}' stepped out of the Dark World.` 
                    });
                }
                break;
            }

            case 'error': {
                console.warn('[Multiplayer Server Notice]', data.message);
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('log:entry', { tag: 'WARN', message: data.message });
                }
                break;
            }

            case 'chat_message': {
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('chat:received', data);
                    window.EventBus.emit('log:entry', {
                        tag: 'CHAT',
                        message: `[${data.room || 'world'}] ${data.username}: ${data.message}`
                    });
                }
                break;
            }

            case 'chat_ack': {
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('chat:ack', data);
                }
                break;
            }

            case 'chat_error': {
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('chat:error', data);
                    window.EventBus.emit('log:entry', { tag: 'CHAT', message: data.message || 'Rate limit reached' });
                }
                break;
            }
        }
    }

    /**
     * Submits a chat message to the server for room broadcast.
     */
    sendChatMessage(text, options = {}) {
        if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return { success: false, error: 'Not connected to multiplayer room.' };
        }
        const cleanMsg = (text || '').trim().slice(0, 70);
        if (!cleanMsg) {
            return { success: false, error: 'Message cannot be empty.' };
        }

        const gs = window.GameState;
        const room = this.currentRoom || (gs && gs.currentRoom) || 'world';
        const dimension = 'LIGHT';
        const hideName = (options.hideName !== undefined) 
            ? !!options.hideName 
            : (localStorage.getItem('dw_hide_player_name') === 'true');

        this.socket.send(JSON.stringify({
            type: 'chat',
            message: cleanMsg,
            room: room,
            dimension: dimension,
            hideName: hideName
        }));

        return { success: true };
    }

    /**
     * Spawns a WebGL entity and DOM nametag for a remote player in the Dark World.
     */
    spawnRemotePlayer(playerData) {
        if (!playerData || !playerData.id || this.remotePlayers.has(playerData.id)) return;
        if (typeof renderer === 'undefined' || !renderer || !renderer.gl) return;

        const gs = window.GameState;
        let model = null;

        // Use an isolated instance of the player model geometry so remote players never share node matrices with Link
        if (gs && gs.characterEntity && gs.characterEntity.model) {
            model = typeof gs.characterEntity.model.createInstance === 'function'
                ? gs.characterEntity.model.createInstance()
                : gs.characterEntity.model;
        } else if (this.remoteModelCache) {
            model = typeof this.remoteModelCache.createInstance === 'function'
                ? this.remoteModelCache.createInstance()
                : this.remoteModelCache;
        } else {
            model = this.createRemotePlayerModel(renderer.gl);
            this.remoteModelCache = model;
        }

        const username = playerData.username || '?';
        const phantomColor = [0.15, 0.85, 1.0]; // Bright celestial cyan
        const remoteEntity = new GameObject(model, phantomColor, true, true);
        const posX = (playerData.x !== undefined && playerData.x !== null) ? Number(playerData.x) : 0;
        let posY = (playerData.y !== undefined && playerData.y !== null) ? Number(playerData.y) : 0;
        const posZ = (playerData.z !== undefined && playerData.z !== null) ? Number(playerData.z) : -2.5;
        const rotY = (playerData.rotationY !== undefined && playerData.rotationY !== null) ? Number(playerData.rotationY) : 0;
        const room = playerData.room || 'world';

        // Snap initial ground height if CollisionWorld is ready
        if (window.CollisionWorld && typeof window.CollisionWorld.getGroundHeight === 'function') {
            const groundY = window.CollisionWorld.getGroundHeight(posX, posZ, posY, 0.4, 500.0);
            if (groundY !== null && !isNaN(groundY)) {
                posY = Math.max(posY, groundY);
            }
        }

        remoteEntity.position = [posX, posY, posZ];
        remoteEntity.rotationY = rotY;
        remoteEntity.scale = [1.0, 1.0, 1.0];
        remoteEntity.isRemotePlayer = true;
        remoteEntity.name = `PLAYER: ${username}`;

        const inCurrentRoom = !room || room === this.currentRoom;
        if (inCurrentRoom && !renderer.gameObjects.includes(remoteEntity)) {
            renderer.addEntity(remoteEntity);
        }

        // Create DOM overhead nametag
        const badgeEl = this.createNametagElement(playerData.id, username);
        if (!inCurrentRoom) {
            badgeEl.style.display = 'none';
        }

        const dimension = playerData.dimension || 'LIGHT';

        this.remotePlayers.set(playerData.id, {
            id: playerData.id,
            username: username,
            room: room,
            dimension: dimension,
            entity: remoteEntity,
            badgeEl: badgeEl,
            targetX: posX,
            targetY: posY,
            targetZ: posZ,
            targetRotY: rotY,
            smoothedSpeed: 0.0
        });
    }

    /**
     * Notifies the WebSocket server of a room transition and requests occupants.
     */
    notifyRoomChange(roomName, dimension = null) {
        this.currentRoom = roomName || 'world';
        this.currentDimension = 'LIGHT';
        if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;

        const gs = window.GameState;
        const char = gs ? gs.characterEntity : null;
        const coords = {
            x: char ? Math.round(char.position[0] * 10) / 10 : 0,
            y: char ? Math.round(char.position[1] * 10) / 10 : 0,
            z: char ? Math.round(char.position[2] * 10) / 10 : -2.5,
            rotationY: char ? Math.round(char.rotationY * 100) / 100 : 0
        };

        this.socket.send(JSON.stringify({
            type: 'room_change',
            dimension: 'LIGHT',
            room: this.currentRoom,
            x: coords.x,
            y: coords.y,
            z: coords.z,
            rotationY: coords.rotationY
        }));
    }

    /**
     * Resynchronizes all remote players when a new room is loaded:
     * - Filters entities in renderer.gameObjects according to room and dimension membership.
     * - Snaps player elevations to the current room's CollisionWorld ground height.
     * - Toggles nametag visibility so peers in different rooms don't leak into view.
     */
    syncRemotePlayersForRoom(currentRoom) {
        if (!currentRoom) {
            currentRoom = (window.GameState && window.GameState.currentRoom) || 'world';
        }
        this.currentRoom = currentRoom;

        if (typeof renderer === 'undefined' || !renderer || !renderer.gameObjects) return;

        const activeDim = (window.GameState && window.GameState.currentDimension) || this.currentDimension || 'LIGHT';

        for (const [id, rp] of this.remotePlayers) {
            if (!rp || !rp.entity) continue;

            const isSameRoom = !rp.room || rp.room === currentRoom;
            const isSameDim = !rp.dimension || rp.dimension === activeDim;

            if (isSameRoom && isSameDim) {
                // Ensure model is updated to an isolated player model instance if GLTF model loaded after spawn
                const gs = window.GameState;
                if ((!rp.entity.model || rp.entity.model === this.remoteModelCache || (gs && rp.entity.model === gs.characterEntity.model)) && gs && gs.characterEntity && gs.characterEntity.model) {
                    rp.entity.model = typeof gs.characterEntity.model.createInstance === 'function'
                        ? gs.characterEntity.model.createInstance()
                        : gs.characterEntity.model;
                }

                // Ensure entity is registered in renderer.gameObjects
                if (!renderer.gameObjects.includes(rp.entity)) {
                    renderer.addEntity(rp.entity);
                }

                // Snap remote player coordinates to 0.1 increment rule in all rooms
                rp.entity.position[0] = Math.round(rp.entity.position[0] * 10) / 10;
                rp.entity.position[2] = Math.round(rp.entity.position[2] * 10) / 10;

                // Snap remote player's Y to terrain floor of current room so they are never subterranean
                if (window.CollisionWorld && typeof window.CollisionWorld.getGroundHeight === 'function') {
                    const groundY = window.CollisionWorld.getGroundHeight(
                        rp.entity.position[0],
                        rp.entity.position[2],
                        rp.entity.position[1],
                        0.4,
                        500.0
                    );
                    if (groundY !== null && !isNaN(groundY)) {
                        rp.entity.position[1] = Math.max(rp.entity.position[1], groundY);
                    }
                }
                rp.entity.position[1] = Math.round(rp.entity.position[1] * 10) / 10;
                rp.targetX = rp.entity.position[0];
                rp.targetY = rp.entity.position[1];
                rp.targetZ = rp.entity.position[2];
                rp.targetRotY = rp.entity.rotationY;
                rp.smoothedSpeed = 0.0;

                if (rp.badgeEl) {
                    rp.badgeEl.style.display = 'block';
                }
            } else {
                // Remote player is in another room or dimension: remove from active renderer and hide nametag
                const idx = renderer.gameObjects.indexOf(rp.entity);
                if (idx !== -1) {
                    renderer.gameObjects.splice(idx, 1);
                }
                if (rp.badgeEl) {
                    rp.badgeEl.style.display = 'none';
                }
            }
        }
        this.updateNametagPositions();
    }

    /**
     * Builds a clean procedural player model if the main GLTF is not ready.
     */
    createRemotePlayerModel(gl) {
        if (!gl || typeof SubModel === 'undefined') return null;

        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        const segments = 6;
        const radius = 0.45;
        const height = 1.8;

        // Top cap center
        positions.push(0, height, 0);
        normals.push(0, 1, 0);
        uvs.push(0.5, 0.5);

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            positions.push(x, height, z);
            normals.push(0, 1, 0);
            uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
        }

        for (let i = 1; i <= segments; i++) {
            indices.push(0, i, i + 1);
        }

        const baseIdx = positions.length / 3;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            positions.push(x, height, z);
            normals.push(x / radius, 0, z / radius);
            uvs.push(i / segments, 1.0);

            positions.push(x, 0, z);
            normals.push(x / radius, 0, z / radius);
            uvs.push(i / segments, 0.0);
        }

        for (let i = 0; i < segments; i++) {
            const p1 = baseIdx + i * 2;
            const p2 = p1 + 1;
            const p3 = p1 + 2;
            const p4 = p1 + 3;
            indices.push(p1, p2, p3);
            indices.push(p2, p4, p3);
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const normBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([38, 217, 255, 255]));

        const prim = {
            vao,
            indexCount: indices.length,
            indexComponentType: gl.UNSIGNED_SHORT,
            hasUVs: true,
            nodeMatrix: Mat4.create(),
            texture: tex,
            mode: gl.TRIANGLES
        };

        const cpuTriangles = [];
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3;
            cpuTriangles.push([
                [positions[i0], positions[i0 + 1], positions[i0 + 2]],
                [positions[i1], positions[i1 + 1], positions[i1 + 2]],
                [positions[i2], positions[i2 + 1], positions[i2 + 2]]
            ]);
        }

        return new SubModel(gl, [prim], cpuTriangles, tex);
    }

    createNametagElement(id, username) {
        const screenContainer = document.getElementById('game-screen-container') || document.body;
        if (!this.nametagContainer) {
            this.nametagContainer = document.getElementById('darkworld-nametags-container');
            if (!this.nametagContainer) {
                this.nametagContainer = document.createElement('div');
                this.nametagContainer.id = 'darkworld-nametags-container';
                this.nametagContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 600; overflow: hidden;';
                screenContainer.appendChild(this.nametagContainer);
            }
        }
        if (this.nametagContainer.parentElement !== screenContainer) {
            screenContainer.appendChild(this.nametagContainer);
        }

        const tag = document.createElement('div');
        tag.id = `dw-nametag-${id}`;
        tag.className = 'darkworld-nametag';
        tag.style.cssText = `
            position: absolute;
            background: rgba(8, 12, 18, 0.88);
            border: 1px solid #00bcd4;
            color: #00bcd4;
            font-family: monospace;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            box-shadow: 0 0 8px rgba(0, 188, 212, 0.4);
            white-space: nowrap;
            pointer-events: none;
            transition: transform 0.05s linear;
        `;
        tag.textContent = username;
        this.nametagContainer.appendChild(tag);
        return tag;
    }

    project3DWorldToScreen(px, py, pz) {
        if (typeof window.project3DWorldToScreen === 'function') {
            return window.project3DWorldToScreen(px, py, pz);
        }
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

        if (clipW <= 0.05) return null; // Behind or too close to camera plane

        const ndcX = clipX / clipW;
        const ndcY = clipY / clipW;

        // View frustum boundary check
        if (ndcX < -1.4 || ndcX > 1.4 || ndcY < -1.4 || ndcY > 1.4) return null;

        const viewWidth = renderer.canvas.width;
        const viewHeight = renderer.canvas.height;

        const screenX = (ndcX * 0.5 + 0.5) * viewWidth;
        const screenY = (0.5 - ndcY * 0.5) * viewHeight;

        return { x: screenX, y: screenY };
    }

    /**
     * Smoothly blends remote player positions and rotations between network updates.
     */
    interpolateRemotePlayers(dt) {
        if (this.remotePlayers.size === 0) return;
        const safeDt = Math.min(0.1, Math.max(0.001, dt || 0.016));

        // Exponential decay interpolation factors
        // At lambda = 14.0, position catches up smoothly over ~70ms without overshoot or jitter
        const posAlpha = 1.0 - Math.exp(-14.0 * safeDt);
        const rotAlpha = 1.0 - Math.exp(-16.0 * safeDt);
        const speedAlpha = 1.0 - Math.exp(-10.0 * safeDt);

        for (const [id, rp] of this.remotePlayers) {
            if (!rp || !rp.entity) continue;
            if (rp.targetX === undefined) continue;

            const pos = rp.entity.position;
            const prevX = pos[0];
            const prevY = pos[1];
            const prevZ = pos[2];

            // Smooth position blend towards network target
            pos[0] += (rp.targetX - pos[0]) * posAlpha;
            pos[1] += (rp.targetY - pos[1]) * posAlpha;
            pos[2] += (rp.targetZ - pos[2]) * posAlpha;

            // Smooth rotation blend using shortest arc
            let diffRot = (rp.targetRotY - rp.entity.rotationY) % (Math.PI * 2);
            if (diffRot > Math.PI) diffRot -= Math.PI * 2;
            if (diffRot < -Math.PI) diffRot += Math.PI * 2;
            rp.entity.rotationY += diffRot * rotAlpha;

            // Frame displacement to compute continuous velocity
            const frameDist = Math.hypot(pos[0] - prevX, pos[2] - prevZ);
            const instantSpeed = frameDist / safeDt;

            if (rp.smoothedSpeed === undefined) rp.smoothedSpeed = 0;
            rp.smoothedSpeed += (instantSpeed - rp.smoothedSpeed) * speedAlpha;
            rp.entity.smoothedSpeed = rp.smoothedSpeed;

            // Vertical velocity tracking for descent detection
            const instantVy = (pos[1] - prevY) / safeDt;
            if (rp.smoothedVy === undefined) rp.smoothedVy = 0;
            rp.smoothedVy += (instantVy - rp.smoothedVy) * speedAlpha;
            rp.entity.smoothedVy = rp.smoothedVy;
        }
    }

    updateNametagPositions() {
        if (this.remotePlayers.size === 0) return;
        if (!renderer || !renderer.canvas) return;

        const gs = window.GameState;
        if (!gs) return;

        for (const [_, rp] of this.remotePlayers) {
            if (!rp.entity || !rp.badgeEl) continue;

            if (rp.room && rp.room !== this.currentRoom) {
                if (rp._lastVisible !== false) {
                    rp.badgeEl.style.display = 'none';
                    rp._lastVisible = false;
                }
                continue;
            }

            const pX = rp.entity.position[0];
            const pY = rp.entity.position[1] + 1.9;
            const pZ = rp.entity.position[2];

            const screen = this.project3DWorldToScreen(pX, pY, pZ);
            if (screen) {
                const sx = Math.round(screen.x);
                const sy = Math.round(screen.y);
                if (rp._lastVisible !== true) {
                    rp.badgeEl.style.display = 'block';
                    rp._lastVisible = true;
                }
                if (rp._lastX !== sx || rp._lastY !== sy) {
                    rp.badgeEl.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
                    rp._lastX = sx;
                    rp._lastY = sy;
                }
                const displayName = (rp.username === '??') ? '??' : ((rp.username === '?') ? '?' : `${rp.username} (${pX.toFixed(1)}, ${pZ.toFixed(1)})`);
                if (rp._lastLabel !== displayName) {
                    rp.badgeEl.textContent = displayName;
                    rp._lastLabel = displayName;
                }
            } else if (rp._lastVisible !== false) {
                rp.badgeEl.style.display = 'none';
                rp._lastVisible = false;
            }
        }
    }

    removeRemotePlayer(playerId) {
        if (!this.remotePlayers.has(playerId)) return;
        const rp = this.remotePlayers.get(playerId);

        if (renderer && renderer.gameObjects && rp.entity) {
            const idx = renderer.gameObjects.indexOf(rp.entity);
            if (idx !== -1) renderer.gameObjects.splice(idx, 1);
        }

        if (rp.badgeEl && rp.badgeEl.parentNode) {
            rp.badgeEl.parentNode.removeChild(rp.badgeEl);
        }

        this.remotePlayers.delete(playerId);
    }

    cleanupRemotePlayers() {
        for (const [id, rp] of this.remotePlayers) {
            if (renderer && renderer.gameObjects && rp.entity) {
                const idx = renderer.gameObjects.indexOf(rp.entity);
                if (idx !== -1) renderer.gameObjects.splice(idx, 1);
            }
            if (rp.badgeEl && rp.badgeEl.parentNode) {
                rp.badgeEl.parentNode.removeChild(rp.badgeEl);
            }
        }
        this.remotePlayers.clear();
    }

    /**
     * Transmits local character position to remote peers at quantized 0.1 increments.
     * @param {GameObject} characterEntity
     * @param {boolean} force - If true, bypasses throttle and stationary suppression (e.g. upon room load)
     */
    sendLocalUpdate(characterEntity, force = false) {
        if (!this.isConnected || !this.socket || !this.socket.readyState || this.socket.readyState !== WebSocket.OPEN) return;

        const now = performance.now();
        if (!force && (now - this.lastSendTimestamp < this.sendIntervalMs)) return;

        const gs = window.GameState;
        const activeDim = 'LIGHT';

        const x = Math.round((Number(characterEntity.position[0]) || 0) * 10) / 10;
        const y = Math.round((Number(characterEntity.position[1]) || 0) * 10) / 10;
        const z = Math.round((Number(characterEntity.position[2]) || 0) * 10) / 10;
        const rotationY = Math.round((Number(characterEntity.rotationY) || 0) * 100) / 100;

        const currentRoom = this.currentRoom || (gs && gs.currentRoom) || 'world';

        if (!force && this.lastSentState) {
            if (this.lastSentState.x === x &&
                this.lastSentState.y === y &&
                this.lastSentState.z === z &&
                this.lastSentState.rotationY === rotationY &&
                this.lastSentState.room === currentRoom) {
                return; // Suppress redundant stationary packets
            }
        }

        if (!this.lastSentState) {
            this.lastSentState = { x, y, z, rotationY, room: currentRoom, dimension: activeDim };
        } else {
            this.lastSentState.x = x;
            this.lastSentState.y = y;
            this.lastSentState.z = z;
            this.lastSentState.rotationY = rotationY;
            this.lastSentState.room = currentRoom;
            this.lastSentState.dimension = activeDim;
        }
        this.lastSendTimestamp = now;

        const isHidden = (window.ChatUI && window.ChatUI.isRegistered && window.ChatUI.hidePlayerName) || 
                         (localStorage.getItem('dw_hide_player_name') === 'true');

        const isRolling = !!(window.characterAnimatorInstance && window.characterAnimatorInstance.isRolling);
        const currentState = isRolling ? 'ROLLING' : (gs ? gs.playerState : 'GROUNDED');

        const movePacket = {
            type: 'move',
            dimension: activeDim,
            room: currentRoom,
            x: x,
            y: y,
            z: z,
            rotationY: rotationY,
            state: currentState,
            hideName: !!isHidden
        };
        // Send 'move' for existing servers listening for move
        this.socket.send(JSON.stringify(movePacket));

        // Also send 'update' for protocol adherence to MULTIPLAYER.md
        movePacket.type = 'update';
        this.socket.send(JSON.stringify(movePacket));
    }

    /**
     * Cleanly disconnects and notifies the server.
     */
    disconnect() {
        if (this.socket) {
            if (this.socket.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send(JSON.stringify({ type: 'leave' }));
                } catch (e) {}
            }
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.cleanupRemotePlayers();
    }

    /**
     * Dynamically switches the active multiplayer WebSocket connection to a new website's server
     * when a room is streamed as a PAX TAR archive, without stopping the running 3D engine.
     */
    switchServer(targetHost, targetRoom = null) {
        if (!targetHost) return;
        let cleanHost = String(targetHost).trim();
        try {
            if (cleanHost.startsWith('http://') || cleanHost.startsWith('https://') || cleanHost.startsWith('ws://') || cleanHost.startsWith('wss://')) {
                cleanHost = new URL(cleanHost).hostname;
            } else {
                cleanHost = cleanHost.split('/')[0].split(':')[0];
            }
        } catch (e) {
            cleanHost = cleanHost.split('/')[0].split(':')[0];
        }
        if (!cleanHost) return;

        window.targetServerHost = cleanHost;
        window.DARK_WORLD_WS_HOST = cleanHost;
        window.loadedFromHost = cleanHost;
        if (window.parent && window.parent !== window) {
            try {
                if (window.parent.addrBarSystem) {
                    window.parent.addrBarSystem.active_host = cleanHost;
                }
            } catch (e) {}
        }

        if (targetRoom) {
            this.currentRoom = targetRoom;
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', {
                tag: 'NET',
                message: `Switching multiplayer server connection to '${cleanHost}' (room: '${this.currentRoom}')...`
            });
        }

        this.disconnect();
        this.connect();
    }
}

// Global Singleton Instance
window.DarkWorldMultiplayer = new DarkWorldMultiplayerClient();
