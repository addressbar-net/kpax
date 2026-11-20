/**
 * farmeraga.com — Real-Time 3D Multiplayer & Chat WebSocket Server
 * 
 * Backed by SQLite (Zero MySQL dependency)
 * Supports DUAL PROTOCOL (Plain HTTP/WS and TLS HTTPS/WSS) on port 8080.
 * Serves 0.1-increment quantized real-time player synchronization
 * across the 3D Cardinal Realms of Farmeraga.
 */

const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// ===========================================================================
// 1. SQLite Database Initialization & Helper Layer
// ===========================================================================
let sqliteDb = null;
let sqliteDbPath = null;

// Dedicated SQLite database file for the game (located directly in farm_server/)
const candidateDbPaths = [
    process.env.SQLITE_PATH,
    process.env.DB_PATH,
    path.join(__dirname, 'farm_game.sqlite'),
    '/tmp/html/farm_server/farm_game.sqlite',
    '/addr.bar/farm_server/farm_game.sqlite'
].filter(Boolean);

class SQLiteAdapter {
    constructor(driver, type, dbPath) {
        this.driver = driver;
        this.type = type; // 'native', 'better-sqlite3', 'cli'
        this.dbPath = dbPath;
    }

    exec(sql) {
        if (this.type === 'native' || this.type === 'better-sqlite3') {
            return this.driver.exec(sql);
        } else if (this.type === 'cli') {
            const { execFileSync } = require('child_process');
            return execFileSync('sqlite3', [this.dbPath, sql], { encoding: 'utf8' });
        }
    }

    pragma(str) {
        if (this.type === 'better-sqlite3') {
            return this.driver.pragma(str);
        }
        return this.exec(`PRAGMA ${str};`);
    }

    prepare(sql) {
        if (this.type === 'native' || this.type === 'better-sqlite3') {
            const stmt = this.driver.prepare(sql);
            return {
                all: (...params) => stmt.all(...params),
                get: (...params) => stmt.get(...params),
                run: (...params) => stmt.run(...params)
            };
        } else if (this.type === 'cli') {
            const { execFileSync } = require('child_process');
            const dbPath = this.dbPath;

            const escapeParam = (p) => {
                if (p === null || p === undefined) return 'NULL';
                if (typeof p === 'number') return p;
                return "'" + String(p).replace(/'/g, "''") + "'";
            };

            const buildSql = (params) => {
                let pIndex = 0;
                return sql.replace(/\?/g, () => escapeParam(params[pIndex++]));
            };

            return {
                all: (...params) => {
                    const finalSql = buildSql(params);
                    const stdout = execFileSync('sqlite3', [dbPath, '-json', finalSql], { encoding: 'utf8' });
                    if (!stdout || !stdout.trim()) return [];
                    return JSON.parse(stdout);
                },
                get: (...params) => {
                    const finalSql = buildSql(params);
                    const stdout = execFileSync('sqlite3', [dbPath, '-json', finalSql], { encoding: 'utf8' });
                    if (!stdout || !stdout.trim()) return undefined;
                    const rows = JSON.parse(stdout);
                    return (rows && rows.length > 0) ? rows[0] : undefined;
                },
                run: (...params) => {
                    const finalSql = buildSql(params);
                    execFileSync('sqlite3', [dbPath, finalSql], { encoding: 'utf8' });
                    return { changes: 1 };
                }
            };
        }
    }
}

function initSQLite() {
    // Select first existing path or default directly to farm_game.sqlite in farm_server directory
    for (const p of candidateDbPaths) {
        if (fs.existsSync(p)) {
            sqliteDbPath = p;
            break;
        }
    }
    if (!sqliteDbPath) {
        sqliteDbPath = path.join(__dirname, 'farm_game.sqlite');
    }

    const dbDir = path.dirname(sqliteDbPath);
    if (!fs.existsSync(dbDir)) {
        try {
            fs.mkdirSync(dbDir, { recursive: true });
        } catch (e) {
            console.error('[SQLite] Failed to create database directory:', e.message);
        }
    }
    try {
        fs.chmodSync(dbDir, 0o777);
    } catch (e) {}

    let adapter = null;

    // 1. Prefer built-in node:sqlite (Node 22+)
    try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(sqliteDbPath);
        adapter = new SQLiteAdapter(db, 'native', sqliteDbPath);
        console.log(`[SQLite] Connected using native node:sqlite DatabaseSync to: ${sqliteDbPath}`);
    } catch (nativeErr) {
        // 2. Fallback to better-sqlite3 if installed
        try {
            const BetterSqlite3 = require('better-sqlite3');
            const db = new BetterSqlite3(sqliteDbPath);
            adapter = new SQLiteAdapter(db, 'better-sqlite3', sqliteDbPath);
            console.log(`[SQLite] Connected using better-sqlite3 to: ${sqliteDbPath}`);
        } catch (betterErr) {
            // 3. Fallback to system sqlite3 CLI binary (available on all Linux servers without Node build tools)
            try {
                const { execFileSync } = require('child_process');
                execFileSync('sqlite3', ['-version'], { stdio: 'pipe' });
                adapter = new SQLiteAdapter(null, 'cli', sqliteDbPath);
                console.log(`[SQLite] Connected using system sqlite3 CLI fallback to: ${sqliteDbPath}`);
            } catch (cliErr) {
                console.error('[SQLite Fatal] Failed to initialize SQLite database with any driver:', {
                    native: nativeErr.message,
                    betterSqlite3: betterErr.message,
                    cli: cliErr.message
                });
                return null;
            }
        }
    }

    sqliteDb = adapter;
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec('PRAGMA busy_timeout = 5000;');

    // Initialize required SQLite tables
    try {
        sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                domain TEXT DEFAULT 'farmeraga.com',
                username TEXT NOT NULL UNIQUE,
                password TEXT DEFAULT NULL,
                email TEXT DEFAULT NULL,
                session_token TEXT DEFAULT NULL,
                locked INTEGER DEFAULT 0,
                chat_minute_count INTEGER DEFAULT 0,
                chat_minute_window_start INTEGER DEFAULT 0,
                chat_hour_count INTEGER DEFAULT 0,
                chat_hour_window_start INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER DEFAULT NULL,
                username TEXT NOT NULL,
                room TEXT DEFAULT 'world',
                dimension TEXT DEFAULT 'DARK',
                message TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

            CREATE TABLE IF NOT EXISTS ip_registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL,
                registered_at TEXT DEFAULT (datetime('now'))
            );
        `);

        // Ensure missing columns exist on older tables
        const tableInfo = sqliteDb.prepare("PRAGMA table_info(users)").all();
        const existingColumns = new Set(tableInfo.map(col => col.name));
        const neededColumns = [
            ['locked', 'INTEGER DEFAULT 0'],
            ['chat_minute_count', 'INTEGER DEFAULT 0'],
            ['chat_minute_window_start', 'INTEGER DEFAULT 0'],
            ['chat_hour_count', 'INTEGER DEFAULT 0'],
            ['chat_hour_window_start', 'INTEGER DEFAULT 0']
        ];
        for (const [colName, colDef] of neededColumns) {
            if (!existingColumns.has(colName)) {
                try {
                    sqliteDb.exec(`ALTER TABLE users ADD COLUMN ${colName} ${colDef};`);
                    console.log(`[SQLite Migration] Added column ${colName} to users table.`);
                } catch (e) {
                    // Column may already exist
                }
            }
        }
        console.log('[SQLite] Database schema verified & ready.');
    } catch (schemaErr) {
        console.error('[SQLite] Schema initialization error:', schemaErr.message);
    }

// Ensure permissions are open on database and directory
    try {
        fs.chmodSync(sqliteDbPath, 0o666);
        const walPath = sqliteDbPath + '-wal';
        const shmPath = sqliteDbPath + '-shm';
        if (fs.existsSync(walPath)) fs.chmodSync(walPath, 0o666);
        if (fs.existsSync(shmPath)) fs.chmodSync(shmPath, 0o666);
    } catch (e) {}

    return sqliteDb;
}

initSQLite();

// ===========================================================================
// 1b. Hourly Database & State Synchronization (Exact Duplicate to Disk)
// Saves live /tmp/html/farm_server runtime to persistent /addr.bar/farm_server
// ===========================================================================
const PERSISTENT_DIR = '/addr.bar/farm_server';

function syncBackupToDisk() {
    if (!sqliteDb || !sqliteDbPath || !fs.existsSync(sqliteDbPath)) return;
    try {
        // 1. Checkpoint WAL mode so database file has latest changes
        try {
            sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch (e) {}

        // 2. If running from /tmp/html/farm_server, mirror to /addr.bar/farm_server
        if (__dirname !== PERSISTENT_DIR && fs.existsSync(PERSISTENT_DIR)) {
            const targetDb = path.join(PERSISTENT_DIR, 'farm_game.sqlite');
            fs.copyFileSync(sqliteDbPath, targetDb);
            try { fs.chmodSync(targetDb, 0o666); } catch (e) {}
            try { fs.chmodSync(PERSISTENT_DIR, 0o777); } catch (e) {}

            // Mirror chat logs directory
            const srcLogs = path.join(__dirname, 'logs', 'chat');
            const destLogs = path.join(PERSISTENT_DIR, 'logs', 'chat');
            if (fs.existsSync(srcLogs)) {
                if (!fs.existsSync(destLogs)) fs.mkdirSync(destLogs, { recursive: true, mode: 0o777 });
                const logFiles = fs.readdirSync(srcLogs);
                for (const file of logFiles) {
                    const srcFilePath = path.join(srcLogs, file);
                    const destFilePath = path.join(destLogs, file);
                    if (fs.statSync(srcFilePath).isFile()) {
                        fs.copyFileSync(srcFilePath, destFilePath);
                        try { fs.chmodSync(destFilePath, 0o666); } catch (e) {}
                    }
                }
            }
            console.log(`[Backup] Synced live server & database to ${targetDb} (single exact duplicate on disk).`);
        }
    } catch (err) {
        console.error('[Backup Error] Failed to sync backup to disk:', err.message);
    }
}

// Hourly synchronization interval (every 60 minutes)
setInterval(syncBackupToDisk, 60 * 60 * 1000);

// Auto-sync on server shutdown signals
process.on('SIGINT', () => {
    console.log('[Shutdown] Received SIGINT. Syncing backup to disk before exit...');
    syncBackupToDisk();
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('[Shutdown] Received SIGTERM. Syncing backup to disk before exit...');
    syncBackupToDisk();
    process.exit(0);
});

// ===========================================================================
// 2. Chat Rate Limits & Database Queries
// ===========================================================================
const MINUTE_LIMIT = 3;
const HOUR_LIMIT = 45;

function loadPlayerDbLimits(username) {
    if (!sqliteDb || !username) return null;
    try {
        const stmt = sqliteDb.prepare(`
            SELECT id, username, locked, chat_minute_count, chat_minute_window_start, chat_hour_count, chat_hour_window_start 
            FROM users 
            WHERE username = ? 
            LIMIT 1
        `);
        const row = stmt.get(username);
        if (row) {
            if (row.locked) return null;
            return row;
        }
    } catch (e) {
        console.error('[SQLite Error] Failed to load chat limits for user:', username, e.message);
    }
    return null;
}

function savePlayerDbLimits(userId, minuteCount, firstMinuteTime, hourCount, firstHourTime) {
    if (!sqliteDb || !userId) return;
    try {
        const stmt = sqliteDb.prepare(`
            UPDATE users 
            SET chat_minute_count = ?, chat_minute_window_start = ?, chat_hour_count = ?, chat_hour_window_start = ? 
            WHERE id = ?
        `);
        stmt.run(minuteCount || 0, firstMinuteTime || 0, hourCount || 0, firstHourTime || 0, userId);
    } catch (e) {
        console.error('[SQLite Error] Failed to save chat limits for user ID:', userId, e.message);
    }
}

function recordChatMessage(userId, username, room, dimension, message) {
    if (!sqliteDb) return;
    try {
        const stmt = sqliteDb.prepare(`
            INSERT INTO chat_messages (user_id, username, room, dimension, message) 
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(userId || null, username, room || 'world', dimension || 'DARK', message);
    } catch (e) {
        console.error('[SQLite Error] Failed to record chat message:', e.message);
    }
}

// ===========================================================================
// 3. File-Based Chat Logging System
// ===========================================================================
const CHAT_LOGS_DIR = path.join(__dirname, 'logs', 'chat');
try {
    if (!fs.existsSync(CHAT_LOGS_DIR)) {
        fs.mkdirSync(CHAT_LOGS_DIR, { recursive: true });
    }
} catch (e) {
    console.error('[Chat Logs] Failed to create chat logs directory:', e.message);
}

function getDayString(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTimestampString(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function sanitizePlayerFilename(username) {
    if (!username) return 'unknown';
    if (username === '??') return 'hidden_user';
    if (username === '?') return 'unregistered_player';
    const clean = String(username).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return clean || 'unknown';
}

function logChatMessageToFile(username, room, dimension, message, timestamp = new Date()) {
    try {
        const dateObj = (timestamp instanceof Date && !isNaN(timestamp)) ? timestamp : new Date(timestamp);
        const dayStr = getDayString(dateObj);
        const timeStr = getTimestampString(dateObj);
        const safeUser = sanitizePlayerFilename(username);
        const logLine = `[${timeStr}] [${room || 'world'}] [${dimension || 'DARK'}] ${username}: ${message}\n`;

        // 1. Daily file with player's name in filename: <player>_<YYYY-MM-DD>.log and .txt
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}_${dayStr}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}_${dayStr}.txt`), logLine, 'utf8');

        // 2. Daily directory with player's name as filename: <YYYY-MM-DD>/<player>.log and .txt
        const dateDir = path.join(CHAT_LOGS_DIR, dayStr);
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        fs.appendFileSync(path.join(dateDir, `${safeUser}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(dateDir, `${safeUser}.txt`), logLine, 'utf8');

        // 3. Player directory with daily file: <player>/<YYYY-MM-DD>.log and .txt
        const playerDir = path.join(CHAT_LOGS_DIR, safeUser);
        if (!fs.existsSync(playerDir)) {
            fs.mkdirSync(playerDir, { recursive: true });
        }
        fs.appendFileSync(path.join(playerDir, `${dayStr}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(playerDir, `${dayStr}.txt`), logLine, 'utf8');

        // 4. Cumulative player file: <player>.log and .txt
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `${safeUser}.txt`), logLine, 'utf8');

        // 5. Overall daily chat log: chat_<YYYY-MM-DD>.log and .txt
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `chat_${dayStr}.log`), logLine, 'utf8');
        fs.appendFileSync(path.join(CHAT_LOGS_DIR, `chat_${dayStr}.txt`), logLine, 'utf8');
    } catch (err) {
        console.error('[Chat Logs] Failed to write chat log to file:', err.message);
    }
}

function backfillChatLogsFromDb() {
    if (!sqliteDb) return;
    try {
        const existingEntries = fs.readdirSync(CHAT_LOGS_DIR);
        if (existingEntries.length === 0) {
            const rows = sqliteDb.prepare('SELECT username, room, dimension, message, created_at FROM chat_messages ORDER BY id ASC').all();
            if (rows && rows.length > 0) {
                console.log(`[Chat Logs] Backfilling ${rows.length} existing chat records from SQLite to log files...`);
                for (const row of rows) {
                    const date = new Date(row.created_at);
                    logChatMessageToFile(row.username, row.room, row.dimension, row.message, date);
                }
                console.log(`[Chat Logs] Initial log files generated successfully.`);
            }
        }
    } catch (e) {
        console.warn('[Chat Logs] Backfill notice:', e.message);
    }
}

backfillChatLogsFromDb();

// ===========================================================================
// 4. Multiplayer State & Protocol
// ===========================================================================
// Active players store: id -> { id, username, x, y, z, rotationY, state, joinedAt, ws, isAlive }
const darkWorldPlayers = new Map();
const userChatLimits = new Map();

let playerIdCounter = 1;
function generatePlayerId(username) {
    const cleanUser = (username || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `farm_${cleanUser}_${Date.now().toString(36)}_${(playerIdCounter++).toString(36)}`;
}

// Coordinate quantizer (0.1 length increment standard)
function snap(val) {
    return Math.round((Number(val) || 0) * 10) / 10;
}

function broadcast(messageObj, excludeWs = null) {
    const payload = JSON.stringify(messageObj);
    for (const [_, player] of darkWorldPlayers) {
        if (player.ws && player.ws !== excludeWs && player.ws.readyState === 1) { // 1 = OPEN
            try {
                player.ws.send(payload);
            } catch (e) {
                console.error('[Broadcast Error]', e.message);
            }
        }
    }
}

function broadcastToRoom(room, messageObj, excludeWs = null) {
    const payload = JSON.stringify(messageObj);
    const targetRoom = (room || 'world').toLowerCase();
    for (const [_, player] of darkWorldPlayers) {
        if (player.ws && player.ws !== excludeWs && player.ws.readyState === 1) {
            const playerRoom = (player.room || 'world').toLowerCase();
            if (playerRoom === targetRoom) {
                try {
                    player.ws.send(payload);
                } catch (e) {
                    console.error('[Broadcast Room Error]', e.message);
                }
            }
        }
    }
}

// ===========================================================================
// 5. HTTP & HTTPS Servers + TLS Configuration
// ===========================================================================
function handleHttpRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url.startsWith('/status') || req.url.startsWith('/api/status')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const playerList = Array.from(darkWorldPlayers.values()).map(p => ({
            id: p.id,
            username: p.username,
            dimension: p.dimension || 'DARK',
            room: p.room || 'world',
            x: p.x,
            y: p.y,
            z: p.z,
            rotationY: p.rotationY,
            state: p.state,
            joinedAt: p.joinedAt
        }));

        res.end(JSON.stringify({
            status: 'online',
            service: 'farmeraga.com Farm Server (Node.js + SQLite)',
            port: PORT,
            database: {
                engine: 'SQLite',
                file: sqliteDbPath,
                connected: !!sqliteDb
            },
            sslEnabled: !!httpsServer,
            activeCount: darkWorldPlayers.size,
            players: playerList,
            quantizationIncrement: 0.1,
            serverTime: new Date().toISOString()
        }, null, 2));
        return;
    }

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            ok: true, 
            service: 'farm_server',
            database: 'sqlite',
            activePlayers: darkWorldPlayers.size 
        }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('farmeraga.com Farm Server (Node.js + SQLite) is running on port ' + PORT + '.\nConnect via ws:// or wss://<host>:' + PORT + ' or query /status.');
}

const httpServer = http.createServer(handleHttpRequest);

// Create TLS HTTPS instance if certificates are available
let httpsServer = null;
const certPairs = [
    { cert: process.env.SSL_CERT, key: process.env.SSL_KEY },
    { cert: path.join(__dirname, 'cert.pem'), key: path.join(__dirname, 'key.pem') },
    { cert: '/home/guest/.local/share/mkcert/localhost.pem', key: '/home/guest/.local/share/mkcert/localhost-key.pem' },
    { cert: '/etc/ssl/certs/ssl-cert-snakeoil.pem', key: '/etc/ssl/private/ssl-cert-snakeoil.key' }
];

let sslOptions = null;
for (const pair of certPairs) {
    if (!pair.cert || !pair.key) continue;
    try {
        if (fs.existsSync(pair.cert) && fs.existsSync(pair.key)) {
            const certData = fs.readFileSync(pair.cert);
            const keyData = fs.readFileSync(pair.key);
            if (certData.includes('BEGIN CERTIFICATE') && keyData.includes('BEGIN PRIVATE KEY')) {
                sslOptions = { cert: certData, key: keyData };
                console.log(`[Farm Server] Loaded TLS Certificate from: ${pair.cert}`);
                break;
            }
        }
    } catch (e) {
        // Continue searching
    }
}

if (sslOptions) {
    try {
        httpsServer = https.createServer(sslOptions, handleHttpRequest);
        console.log(`[Farm Server] HTTPS & WSS protocol enabled.`);
    } catch (e) {
        console.error('[Farm Server Error] Failed to initialize HTTPS server:', e.message);
    }
}

// ===========================================================================
// 6. WebSocket Server & Packet Handlers
// ===========================================================================
let WebSocketServer;
try {
    const wsModule = require('ws');
    WebSocketServer = wsModule.WebSocketServer || wsModule.Server;
} catch (err) {
    console.error('\n======================================================');
    console.error('[Farm Server Error] The "ws" npm package is not installed.');
    console.error('Run: npm install inside the farm_server directory.');
    console.error('======================================================\n');
}

if (WebSocketServer) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    if (httpsServer) {
        httpsServer.on('upgrade', (req, socket, head) => {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        });
    }

    wss.on('connection', (ws, req) => {
        let assignedId = null;
        let authenticatedUser = null;
        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const isEncrypted = !!req.socket.encrypted;
        console.log(`[Socket Connect] Inbound connection from ${clientIp} (${isEncrypted ? 'WSS' : 'WS'})`);

        ws.on('message', async (rawMessage) => {
            let data;
            try {
                data = JSON.parse(rawMessage.toString());
            } catch (err) {
                console.warn('[Socket Error] Malformed packet received');
                return;
            }

            // Packet Type: join
            if (data.type === 'join') {
                const requestedUser = (data.username || '').trim().slice(0, 13);
                let dbUser = loadPlayerDbLimits(requestedUser);
                let isRegistered = !!dbUser;
                let dbUserId = dbUser ? dbUser.id : null;

                authenticatedUser = isRegistered ? String(dbUser.username || '').slice(0, 13) : '?';
                assignedId = generatePlayerId(authenticatedUser);

                const now = Date.now();
                const userKey = isRegistered ? authenticatedUser.toLowerCase() : assignedId.toLowerCase();

                let limits = userChatLimits.get(userKey);
                if (dbUser) {
                    let minCount = dbUser.chat_minute_count || 0;
                    let minStart = Number(dbUser.chat_minute_window_start) || 0;
                    let hrCount = dbUser.chat_hour_count || 0;
                    let hrStart = Number(dbUser.chat_hour_window_start) || 0;

                    if (minStart > 0 && (now - minStart >= 60000)) {
                        minCount = 0;
                        minStart = 0;
                    }
                    if (hrStart > 0 && (now - hrStart >= 3600000)) {
                        hrCount = 0;
                        hrStart = 0;
                    }

                    if (limits) {
                        if (limits.firstMinuteTime > 0 && (now - limits.firstMinuteTime < 60000)) {
                            if (limits.minuteCount > minCount) {
                                minCount = limits.minuteCount;
                                minStart = limits.firstMinuteTime;
                            }
                        }
                        if (limits.firstHourTime > 0 && (now - limits.firstHourTime < 3600000)) {
                            if (limits.hourCount > hrCount) {
                                hrCount = limits.hourCount;
                                hrStart = limits.firstHourTime;
                            }
                        }
                    }

                    limits = {
                        minuteCount: minCount,
                        firstMinuteTime: minStart,
                        hourCount: hrCount,
                        firstHourTime: hrStart
                    };
                    userChatLimits.set(userKey, limits);
                } else if (!limits) {
                    limits = {
                        minuteCount: 0,
                        firstMinuteTime: 0,
                        hourCount: 0,
                        firstHourTime: 0
                    };
                    userChatLimits.set(userKey, limits);
                }

                const newPlayerData = {
                    id: assignedId,
                    username: authenticatedUser,
                    isRegistered: isRegistered,
                    authenticated: isRegistered,
                    hideName: !!(data.hideName || data.hiddenName || data.hidePlayerName),
                    dbUserId: dbUserId,
                    x: snap(data.x || 0),
                    y: snap(data.y || 0),
                    z: snap(data.z || -2.5),
                    rotationY: Math.round((Number(data.rotationY) || 0) * 100) / 100,
                    state: 'IDLE',
                    dimension: (data.dimension === 'SIDE' || data.dimension === 'LIGHT') ? data.dimension : 'DARK',
                    room: data.room || 'world',
                    joinedAt: new Date().toISOString(),
                    ws: ws
                };

                darkWorldPlayers.set(assignedId, newPlayerData);

                // Send welcome confirmation with existing peers
                const existingPlayers = Array.from(darkWorldPlayers.values())
                    .filter(p => p.id !== assignedId && p.room === newPlayerData.room && p.dimension === newPlayerData.dimension)
                    .map(p => ({
                        id: p.id,
                        username: (!p.isRegistered && !p.authenticated) ? '?' : (p.hideName ? '??' : p.username),
                        dimension: p.dimension,
                        room: p.room,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        rotationY: p.rotationY,
                        state: p.state
                    }));

                ws.send(JSON.stringify({
                    type: 'welcome',
                    id: assignedId,
                    username: authenticatedUser,
                    isRegistered: isRegistered,
                    dimension: newPlayerData.dimension,
                    increment: 0.1,
                    players: existingPlayers,
                    minuteCount: limits.minuteCount,
                    minuteLimit: MINUTE_LIMIT,
                    hourCount: limits.hourCount,
                    hourLimit: HOUR_LIMIT
                }));

                const joinDisplayName = (!isRegistered) ? '?' : (newPlayerData.hideName ? '??' : authenticatedUser);
                broadcast({
                    type: 'player_joined',
                    id: assignedId,
                    username: joinDisplayName,
                    dimension: newPlayerData.dimension,
                    room: newPlayerData.room,
                    x: newPlayerData.x,
                    y: newPlayerData.y,
                    z: newPlayerData.z,
                    rotationY: newPlayerData.rotationY,
                    state: newPlayerData.state,
                    player: {
                        id: assignedId,
                        username: joinDisplayName,
                        dimension: newPlayerData.dimension,
                        room: newPlayerData.room,
                        x: newPlayerData.x,
                        y: newPlayerData.y,
                        z: newPlayerData.z,
                        rotationY: newPlayerData.rotationY,
                        state: newPlayerData.state
                    }
                }, ws);

                console.log(`[Player Joined] ${joinDisplayName} (ID: ${assignedId}) in room '${newPlayerData.room}' [${newPlayerData.dimension}]`);
                return;
            }

            // Packet Type: room_change
            if (data.type === 'room_change' && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (!player) return;

                player.room = data.room || 'world';
                if (data.dimension) player.dimension = data.dimension;
                if (data.x !== undefined) player.x = snap(data.x);
                if (data.y !== undefined) player.y = snap(data.y);
                if (data.z !== undefined) player.z = snap(data.z);
                if (data.rotationY !== undefined) player.rotationY = Math.round((Number(data.rotationY) || 0) * 100) / 100;

                console.log(`[Room Change] ${player.username} (ID: ${assignedId}) entered room '${player.room}' [${player.dimension}]`);
                const roomDisplayName = (!player.isRegistered && !player.authenticated) ? '?' : (player.hideName ? '??' : player.username);

                broadcast({
                    type: 'player_room_changed',
                    id: assignedId,
                    username: roomDisplayName,
                    dimension: player.dimension,
                    room: player.room,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY,
                    state: player.state
                }, ws);

                broadcast({
                    type: 'player_moved',
                    id: assignedId,
                    username: roomDisplayName,
                    dimension: player.dimension,
                    room: player.room,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY,
                    state: player.state
                }, ws);

                const roomPeers = Array.from(darkWorldPlayers.values())
                    .filter(p => p.id !== assignedId && p.room === player.room && p.dimension === player.dimension)
                    .map(p => ({
                        id: p.id,
                        username: (!p.isRegistered && !p.authenticated) ? '?' : (p.hideName ? '??' : p.username),
                        dimension: p.dimension,
                        room: p.room,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        rotationY: p.rotationY,
                        state: p.state
                    }));

                ws.send(JSON.stringify({
                    type: 'room_players',
                    dimension: player.dimension,
                    room: player.room,
                    players: roomPeers
                }));
                return;
            }

            // Packet Type: toggle_name
            if ((data.type === 'toggle_name' || data.type === 'chat:nameToggled') && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (player) {
                    player.hideName = !!data.hideName;
                    const displayName = (!player.isRegistered && !player.authenticated) ? '?' : (player.hideName ? '??' : player.username);
                    broadcast({
                        type: 'player_moved',
                        id: assignedId,
                        username: displayName,
                        dimension: player.dimension,
                        room: player.room,
                        x: player.x,
                        y: player.y,
                        z: player.z,
                        rotationY: player.rotationY,
                        state: player.state
                    }, ws);
                }
                return;
            }

            // Packet Type: move or update
            if ((data.type === 'move' || data.type === 'update') && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (!player) return;

                if (data.hideName !== undefined) player.hideName = !!data.hideName;
                player.x = snap(data.x);
                player.y = snap(data.y);
                player.z = snap(data.z);
                player.rotationY = Math.round((Number(data.rotationY) || 0) * 100) / 100;
                player.state = data.state || 'IDLE';
                if (data.room) player.room = data.room;
                if (data.dimension) player.dimension = data.dimension;

                const displayName = (!player.isRegistered && !player.authenticated) ? '?' : (player.hideName ? '??' : player.username);
                broadcast({
                    type: 'player_moved',
                    id: assignedId,
                    username: displayName,
                    dimension: player.dimension,
                    room: player.room,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY,
                    state: player.state
                }, ws);
                return;
            }

            // Packet Type: chat
            if (data.type === 'chat' && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (!player) return;

                const rawMsg = typeof data.message === 'string' ? data.message.trim() : '';
                if (!rawMsg) return;

                const maxLen = 70;
                const cleanMsg = rawMsg.substring(0, maxLen);
                const userKey = (authenticatedUser || assignedId).toLowerCase();
                const now = Date.now();

                let limits = userChatLimits.get(userKey);
                if (!limits) {
                    limits = {
                        minuteCount: 0,
                        firstMinuteTime: 0,
                        hourCount: 0,
                        firstHourTime: 0
                    };
                    userChatLimits.set(userKey, limits);
                }

                // Check minute reset
                if (limits.firstMinuteTime > 0 && (now - limits.firstMinuteTime >= 60000)) {
                    limits.minuteCount = 0;
                    limits.firstMinuteTime = 0;
                }

                // Check hour reset
                if (limits.firstHourTime > 0 && (now - limits.firstHourTime >= 3600000)) {
                    limits.hourCount = 0;
                    limits.firstHourTime = 0;
                }

                // Enforce minute rate limit (max 3)
                if (limits.minuteCount >= MINUTE_LIMIT) {
                    const remainingMs = Math.max(0, 60000 - (now - limits.firstMinuteTime));
                    ws.send(JSON.stringify({
                        type: 'chat_error',
                        reason: 'minute_limit',
                        message: `Rate limit: ${MINUTE_LIMIT} chats per minute. Resets in ${Math.ceil(remainingMs / 1000)}s.`,
                        minuteCount: limits.minuteCount,
                        firstMinuteTime: limits.firstMinuteTime,
                        minuteLimit: MINUTE_LIMIT,
                        hourCount: limits.hourCount,
                        firstHourTime: limits.firstHourTime,
                        hourLimit: HOUR_LIMIT,
                        cooldownMs: remainingMs
                    }));
                    return;
                }

                // Enforce hourly rate limit (max 45)
                if (limits.hourCount >= HOUR_LIMIT) {
                    const remainingMs = Math.max(0, 3600000 - (now - limits.firstHourTime));
                    const remainingMin = Math.ceil(remainingMs / 60000);
                    ws.send(JSON.stringify({
                        type: 'chat_error',
                        reason: 'hour_limit',
                        message: `Rate limit: ${HOUR_LIMIT} chats per hour. Resets in ${remainingMin}m.`,
                        minuteCount: limits.minuteCount,
                        firstMinuteTime: limits.firstMinuteTime,
                        minuteLimit: MINUTE_LIMIT,
                        hourCount: limits.hourCount,
                        firstHourTime: limits.firstHourTime,
                        hourLimit: HOUR_LIMIT,
                        cooldownMs: remainingMs
                    }));
                    return;
                }

                if (limits.minuteCount === 0) limits.firstMinuteTime = now;
                limits.minuteCount++;

                if (limits.hourCount === 0) limits.firstHourTime = now;
                limits.hourCount++;

                const chatRoom = player.room || data.room || 'world';
                const chatDim = player.dimension || data.dimension || 'DARK';

                let chatAuthor = player.username;
                if (!player.isRegistered) {
                    chatAuthor = '?';
                } else if (data.hideName || data.hiddenName || data.hidePlayerName || player.hideName) {
                    chatAuthor = '??';
                }

                // Persist rate limits and chat messages to SQLite database
                if (player.isRegistered && player.dbUserId) {
                    savePlayerDbLimits(player.dbUserId, limits.minuteCount, limits.firstMinuteTime, limits.hourCount, limits.firstHourTime);
                    recordChatMessage(player.dbUserId, chatAuthor, chatRoom, chatDim, cleanMsg);
                } else {
                    recordChatMessage(null, chatAuthor, chatRoom, chatDim, cleanMsg);
                }

                // Append chat message to daily player log file on disk
                logChatMessageToFile(chatAuthor, chatRoom, chatDim, cleanMsg, new Date(now));

                const chatPacket = {
                    type: 'chat_message',
                    id: assignedId,
                    username: chatAuthor,
                    message: cleanMsg,
                    room: chatRoom,
                    dimension: chatDim,
                    timestamp: now,
                    minuteCount: limits.minuteCount,
                    minuteLimit: MINUTE_LIMIT,
                    hourCount: limits.hourCount,
                    hourLimit: HOUR_LIMIT
                };

                broadcastToRoom(chatRoom, chatPacket);

                ws.send(JSON.stringify({
                    type: 'chat_ack',
                    minuteCount: limits.minuteCount,
                    firstMinuteTime: limits.firstMinuteTime,
                    minuteLimit: MINUTE_LIMIT,
                    hourCount: limits.hourCount,
                    firstHourTime: limits.firstHourTime,
                    hourLimit: HOUR_LIMIT
                }));

                console.log(`[Chat] [${chatRoom}] ${authenticatedUser}: "${cleanMsg}" (${limits.minuteCount}/${MINUTE_LIMIT}m, ${limits.hourCount}/${HOUR_LIMIT}h)`);
                return;
            }

            // Packet Type: ping
            if (data.type === 'ping') {
                ws.isAlive = true;
                ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
                return;
            }

            // Packet Type: leave
            if (data.type === 'leave' && assignedId) {
                const player = darkWorldPlayers.get(assignedId);
                if (player && player.isRegistered && player.dbUserId) {
                    const userKey = (player.username || '').toLowerCase();
                    const limits = userChatLimits.get(userKey);
                    if (limits) {
                        savePlayerDbLimits(player.dbUserId, limits.minuteCount, limits.firstMinuteTime, limits.hourCount, limits.firstHourTime);
                    }
                }
                darkWorldPlayers.delete(assignedId);
                broadcast({ type: 'player_left', id: assignedId, username: authenticatedUser });
                console.log(`[Player Left] ${authenticatedUser} (ID: ${assignedId})`);
                assignedId = null;
                return;
            }
        });

        ws.on('close', (code, reason) => {
            if (assignedId && darkWorldPlayers.has(assignedId)) {
                const player = darkWorldPlayers.get(assignedId);
                if (player && player.isRegistered && player.dbUserId) {
                    const userKey = (player.username || '').toLowerCase();
                    const limits = userChatLimits.get(userKey);
                    if (limits) {
                        savePlayerDbLimits(player.dbUserId, limits.minuteCount, limits.firstMinuteTime, limits.hourCount, limits.firstHourTime);
                    }
                }
                darkWorldPlayers.delete(assignedId);
                broadcast({
                    type: 'player_left',
                    id: assignedId,
                    username: authenticatedUser,
                    code: code
                });
                console.log(`[Socket Closed] ${authenticatedUser} disconnected (code: ${code})`);
            }
        });

        ws.on('error', (err) => {
            console.error(`[Socket Error] ${assignedId || 'unauth'}:`, err.message);
        });
    });

    // Liveness Heartbeat
    const heartbeatInterval = setInterval(() => {
        for (const [id, player] of darkWorldPlayers) {
            if (!player.ws) continue;
            if (player.ws.isAlive === false) {
                console.log(`[Heartbeat Timeout] Terminating inactive socket for ${player.username} (ID: ${id})`);
                player.ws.terminate();
                darkWorldPlayers.delete(id);
                broadcast({ type: 'player_left', id: id, username: player.username });
            } else {
                player.ws.isAlive = false;
                player.ws.ping();
            }
        }
    }, 30000);

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
    });
}

// ===========================================================================
// 7. Master TCP Multiplexer Server (HTTP/HTTPS & WS/WSS)
// ===========================================================================
const masterServer = net.createServer((socket) => {
    socket.once('data', (buffer) => {
        socket.pause();
        socket.unshift(buffer);

        if (buffer[0] === 0x16 && httpsServer) {
            httpsServer.emit('connection', socket);
        } else {
            httpServer.emit('connection', socket);
        }

        process.nextTick(() => socket.resume());
    });

    socket.on('error', (err) => {
        // Silently handle socket aborts
    });
});

masterServer.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`  farmeraga.com Farm Server (Node.js + SQLite Multiplayer)`);
    console.log(`  Listening on port ${PORT} (Host: ${HOST})`);
    console.log(`  SQLite Database: ${sqliteDbPath}`);
    console.log(`  Protocol: Dual HTTP / HTTPS & WS / WSS`);
    console.log(`  TLS Certificate: ${sslOptions ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  Endpoints: ws://${HOST}:${PORT} & wss://${HOST}:${PORT}`);
    console.log(`  Diagnostic Status: http://${HOST}:${PORT}/status`);
    console.log(`================================================================`);
});
