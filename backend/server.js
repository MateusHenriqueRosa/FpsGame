const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
require('dotenv').config();
const {
  normalizeMode,
  getLeaderboardSort,
  calculateMmrDelta,
  toInt,
  toNullableInt,
  toFloat,
  toBool
} = require('./mode-utils');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fps_jwt_super_secret_key_2024';

const app = express();
const PORT = process.env.PORT || 3000;
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '8mb';
const httpServer = http.createServer(app);

// Running behind nginx (docker-compose), enable proxy trust so rate-limit sees client IP
app.set('trust proxy', 1);

// Configurações de Progressão
const SURVIVAL_XP_MULTIPLIER = parseFloat(process.env.SURVIVAL_XP_MULTIPLIER || '0.25');
const SURVIVAL_MIN_XP = parseInt(process.env.SURVIVAL_MIN_XP || '25', 10);
const BR_WIN_XP = parseInt(process.env.BR_WIN_XP || '250', 10);
const BR_MATCH_XP = parseInt(process.env.BR_MATCH_XP || '60', 10);
const BR_KILL_XP = parseInt(process.env.BR_KILL_XP || '12', 10);

// Configuração do Pool PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fps_game',
  user: process.env.DB_USER || 'fps_admin',
  password: process.env.DB_PASSWORD || 'fps_secure_2024',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ==================== CO-OP SERVICE (IN-MEMORY STUB) ====================
const COOP_LOBBY_TTL_MS = parseInt(process.env.COOP_LOBBY_TTL_MS || '900000', 10); // 15 min
const COOP_MAX_HOSTED_PLAYERS = parseInt(process.env.COOP_MAX_HOSTED_PLAYERS || '6', 10);
const COOP_MODES = Object.freeze({
  SURVIVAL: 'survival',
  X1: 'x1'
});
const DEFAULT_COOP_MODE = COOP_MODES.SURVIVAL;
const VALID_COOP_MODES = new Set(Object.values(COOP_MODES));
const coopServiceState = {
  lobbies: new Map()
};
const coopRealtimeState = new Map();
const COOP_WS_PATH = '/coop/socket';
const DEFAULT_PLAYER_SKIN = {
  body: '#ff0000',
  head: '#ff0000',
  texture: null
};
const BASE_UPGRADE_LEVELS = Object.freeze({
  pistolDamage: 0,
  smgDamage: 0,
  smgSpeed: 0,
  rifleDamage: 0,
  rifleSpeed: 0,
  sniperDamage: 0,
  shotgunDamage: 0,
  shotgunPellets: 0,
  bazookaDamage: 0,
  bazookaRadius: 0,
  ammoCapacity: 0,
  moveSpeed: 0
});
const BASE_SUPER_UPGRADES = Object.freeze({
  superPistol: false,
  superRifleSpeed: false,
  superAmmo: false,
  superSpeed: false,
  superRegen: false,
  superShotgun: false,
  superBazooka: false
});
const UPGRADE_KEYS = Object.keys(BASE_UPGRADE_LEVELS);
const SUPER_UPGRADE_KEYS = Object.keys(BASE_SUPER_UPGRADES);
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const now = () => Date.now();

function normalizeCoopMode(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!value) return DEFAULT_COOP_MODE;
  if (['x1', '1v1', 'duelo', 'duel'].includes(value)) {
    return COOP_MODES.X1;
  }
  return VALID_COOP_MODES.has(value) ? value : DEFAULT_COOP_MODE;
}

function getRealtimeChannel(mode = DEFAULT_COOP_MODE) {
  const key = normalizeCoopMode(mode);
  if (!coopRealtimeState.has(key)) {
    coopRealtimeState.set(key, { host: null, clients: new Map() });
  }
  return coopRealtimeState.get(key);
}

function cloneBaseUpgrades() {
  return UPGRADE_KEYS.reduce((acc, key) => {
    acc[key] = BASE_UPGRADE_LEVELS[key] ?? 0;
    return acc;
  }, {});
}

function cloneBaseSuperUpgrades() {
  return SUPER_UPGRADE_KEYS.reduce((acc, key) => {
    acc[key] = BASE_SUPER_UPGRADES[key] ?? false;
    return acc;
  }, {});
}

function createBaseProgression() {
  return {
    points: 0,
    upgrades: cloneBaseUpgrades(),
    super: cloneBaseSuperUpgrades(),
    timestamp: Date.now()
  };
}

function sanitizeProgressionPayload(raw, baseProgression = null) {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.progression && typeof raw.progression === 'object' ? raw.progression : raw;
  const sanitized = baseProgression
    ? {
      points: typeof baseProgression.points === 'number' ? baseProgression.points : 0,
      upgrades: { ...(baseProgression.upgrades || cloneBaseUpgrades()) },
      super: { ...(baseProgression.super || cloneBaseSuperUpgrades()) }
    }
    : createBaseProgression();

  if (Number.isFinite(source.points)) {
    sanitized.points = Math.max(0, Math.min(9999, Math.round(source.points)));
  }
  if (source.upgrades && typeof source.upgrades === 'object') {
    UPGRADE_KEYS.forEach(key => {
      if (Number.isFinite(source.upgrades[key])) {
        sanitized.upgrades[key] = Math.max(0, Math.min(50, Math.round(source.upgrades[key])));
      }
    });
  }
  const superPayload = source.super || source.superUpgrades;
  if (superPayload && typeof superPayload === 'object') {
    SUPER_UPGRADE_KEYS.forEach(key => {
      if (typeof superPayload[key] === 'boolean') {
        sanitized.super[key] = superPayload[key];
      }
    });
  }
  sanitized.timestamp = Date.now();
  return sanitized;
}

function clampNumber(value, min, max, precision = null) {
  if (!Number.isFinite(value)) return null;
  let clamped = Math.max(min, Math.min(max, value));
  if (typeof precision === 'number' && precision >= 0) {
    const factor = 10 ** precision;
    clamped = Math.round(clamped * factor) / factor;
  }
  return clamped;
}

function sanitizeCombatPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = {};
  const health = clampNumber(raw.health, 0, 1000);
  if (health !== null) payload.health = Math.round(health);
  const maxHealth = clampNumber(raw.maxHealth, 1, 1000);
  if (maxHealth !== null) payload.maxHealth = Math.round(maxHealth);
  const round = clampNumber(raw.round, 1, 999);
  if (round !== null) payload.round = Math.round(round);
  const enemiesRemaining = clampNumber(raw.enemiesRemaining, 0, 9999);
  if (enemiesRemaining !== null) payload.enemiesRemaining = Math.round(enemiesRemaining);
  const score = clampNumber(raw.score, 0, 1000000);
  if (score !== null) payload.score = Math.round(score);
  payload.timestamp = Date.now();
  return payload;
}

function sanitizePlayerStatePayload(raw, fallbackName = null) {
  if (!raw || typeof raw !== 'object') return null;
  const resolvedName = normalizePlayerName(raw.playerId || raw.name || fallbackName);
  if (!resolvedName) return null;
  const sanitized = {
    playerId: resolvedName,
    name: normalizePlayerName(raw.name || fallbackName || resolvedName) || resolvedName,
    weapon: (raw.weapon || 'pistol').toString().slice(0, 32),
    timestamp: Date.now()
  };
  if (Array.isArray(raw.position) && raw.position.length === 3) {
    sanitized.position = raw.position.map(value => clampNumber(Number(value), -5000, 5000, 3) ?? 0);
  }
  if (raw.rotation && typeof raw.rotation === 'object') {
    sanitized.rotation = {
      yaw: clampNumber(raw.rotation.yaw, -Math.PI * 4, Math.PI * 4, 4) ?? 0,
      pitch: clampNumber(raw.rotation.pitch, -Math.PI / 2, Math.PI / 2, 4) ?? 0
    };
  }
  if (raw.skin) {
    sanitized.skin = sanitizeSkinPayload(raw.skin) || null;
  }
  if (raw.progression) {
    sanitized.progression = sanitizeProgressionPayload(raw.progression);
  }
  if (raw.combat) {
    sanitized.combat = sanitizeCombatPayload(raw.combat);
  }
  return sanitized;
}

function isClientStateMessage(messageType) {
  if (!messageType) return false;
  return messageType.replace(/[^a-z]/g, '') === 'clientstate';
}

function handleClientStateBroadcast(session, payload) {
  if (!session || session.role !== 'client') return;
  const realtime = getRealtimeChannel(session.mode);
  const sanitizedState = sanitizePlayerStatePayload(payload.player || payload.state || payload.payload, session.name);
  if (!sanitizedState) return;
  sanitizedState.playerId = session.name;
  sanitizedState.name = session.name;
  const clientSlot = realtime.clients.get(session.name);
  if (clientSlot) {
    clientSlot.state = sanitizedState;
  }
  session.state = sanitizedState;
  logger.info('COOP_WS_CLIENT_STATE', 'Estado de cliente recebido', {
    connectionId: session.id,
    player: session.name,
    hasPosition: Array.isArray(sanitizedState.position)
  });
  broadcastRealtime(session.mode, {
    type: 'state',
    source: session.name,
    tick: sanitizedState.timestamp,
    payload: {
      players: {
        [sanitizedState.playerId]: sanitizedState
      }
    }
  });
}

function pruneCoopLobby(mode = null) {
  const targets = mode ? [normalizeCoopMode(mode)] : Array.from(coopServiceState.lobbies.keys());
  targets.forEach(key => {
    const lobby = coopServiceState.lobbies.get(key);
    if (!lobby) return;
    const expired = now() - lobby.updatedAt > COOP_LOBBY_TTL_MS;
    if (expired) {
      logger.info('COOP_LOBBY_EXPIRED', 'Lobby expirado por inatividade', { lobbyId: lobby.id, mode: key });
      teardownCoopLobby(key, 'ttl_expired');
    }
  });
}

function getActiveLobby(mode = DEFAULT_COOP_MODE) {
  pruneCoopLobby(mode);
  return coopServiceState.lobbies.get(normalizeCoopMode(mode)) || null;
}

function sanitizeLobbyPayload(body = {}) {
  const mode = normalizeCoopMode(body.mode);
  const lobbyName = String(body.lobbyName || body.name || 'Lobby Co-Op').slice(0, 48);
  // X1 é duelo 1v1, máximo 2 jogadores (1 host + 1 cliente)
  const defaultCapacity = mode === COOP_MODES.X1 ? 2 : 4;
  const maxCap = mode === COOP_MODES.X1 ? 2 : COOP_MAX_HOSTED_PLAYERS;
  const maxPlayers = Math.min(
    Math.max(parseInt(body.maxPlayers, 10) || defaultCapacity, 2),
    maxCap
  );
  const port = Math.min(Math.max(parseInt(body.port, 10) || 7777, 1024), 65535);
  const interfaceIp = (body.interface || body.address || '').trim().slice(0, 64) || null;
  const announce = Boolean(body.announce !== false);
  const hostPlayer = (body.hostPlayer || body.host || '').toString().trim().slice(0, 32) || 'Host';

  return {
    mode,
    lobbyName,
    maxPlayers,
    port,
    interfaceIp,
    announce,
    hostPlayer
  };
}

function sanitizeSkinPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = {
    body: typeof raw.body === 'string' ? raw.body.trim() : null,
    head: typeof raw.head === 'string' ? raw.head.trim() : null,
    texture: typeof raw.texture === 'string' ? raw.texture.trim() : null
  };

  const body = candidate.body && HEX_COLOR_REGEX.test(candidate.body) ? candidate.body : null;
  const head = candidate.head && HEX_COLOR_REGEX.test(candidate.head) ? candidate.head : null;
  const texture = candidate.texture || null;

  if (!body && !head && !texture) {
    return null;
  }

  return {
    body: body || DEFAULT_PLAYER_SKIN.body,
    head: head || DEFAULT_PLAYER_SKIN.head,
    texture: texture || null
  };
}

function mergeSkinData(baseSkin, newSkin) {
  if (!newSkin) return baseSkin || null;
  const base = baseSkin || DEFAULT_PLAYER_SKIN;
  return {
    body: newSkin.body || base.body,
    head: newSkin.head || base.head,
    texture: typeof newSkin.texture === 'string'
      ? newSkin.texture
      : (typeof base.texture === 'string' ? base.texture : null)
  };
}

function ensureCoopLobby(body, meta = {}) {
  const payload = sanitizeLobbyPayload(body);
  const timestamp = now();
  const lobbyRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(timestamp),
    name: payload.lobbyName,
    mode: payload.mode,
    port: payload.port,
    maxPlayers: payload.maxPlayers,
    interface: payload.interfaceIp,
    announce: payload.announce,
    hostIp: meta.hostIp || null,
    hostPlayer: payload.hostPlayer,
    hostToken: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    hostSkin: meta.hostSkin || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    players: []
  };
  coopServiceState.lobbies.set(payload.mode, lobbyRecord);
  return lobbyRecord;
}

function registerCoopPlayer(lobby, playerName, meta = {}) {
  if (!lobby) return { ok: false, reason: 'LOBBY_MISSING' };
  const normalizedName = playerName ? String(playerName).slice(0, 32) : 'Convidado';
  const existing = lobby.players.find(p => p.name === normalizedName);
  const sanitizedSkin = sanitizeSkinPayload(meta.skin || meta.playerSkin);
  let playerRecord = existing || null;

  if (!existing) {
    const currentCount = 1 + lobby.players.length; // host + clients
    if (currentCount >= lobby.maxPlayers) {
      return { ok: false, reason: 'LOBBY_FULL' };
    }
    lobby.players.push({
      name: normalizedName,
      address: meta.address || null,
      joinedAt: now(),
      skin: sanitizedSkin || null
    });
    playerRecord = lobby.players[lobby.players.length - 1];
  } else {
    existing.joinedAt = now();
    existing.address = meta.address || existing.address;
    if (sanitizedSkin) {
      existing.skin = mergeSkinData(existing.skin, sanitizedSkin);
    }
    playerRecord = existing;
  }
  lobby.updatedAt = now();
  return { ok: true, lobby, player: playerRecord };
}

function removeCoopPlayer(lobby, playerName) {
  if (!lobby || !playerName) return;
  lobby.players = lobby.players.filter(player => player.name !== playerName);
  lobby.updatedAt = now();
}

function getCoopPresencePayload(mode = DEFAULT_COOP_MODE) {
  const lobby = getActiveLobby(mode);
  if (!lobby) {
    return {
      mode,
      online: false,
      players_online: 0,
      timestamp: new Date().toISOString()
    };
  }
  const playersOnline = Math.min(lobby.maxPlayers, 1 + lobby.players.length);
  return {
    mode,
    online: true,
    timestamp: new Date().toISOString(),
    players_online: playersOnline,
    lobby: {
      id: lobby.id,
      name: lobby.name,
      mode: lobby.mode,
      port: lobby.port,
      maxPlayers: lobby.maxPlayers,
      announce: lobby.announce,
      interface: lobby.interface,
      hostPlayer: lobby.hostPlayer,
      hostSkin: lobby.hostSkin || null
    }
  };
}

function summarizeLobby(lobby, options = {}) {
  if (!lobby) return null;
  return {
    id: lobby.id,
    name: lobby.name,
    mode: lobby.mode || DEFAULT_COOP_MODE,
    port: lobby.port,
    interface: lobby.interface || lobby.hostIp,
    maxPlayers: lobby.maxPlayers,
    announce: lobby.announce,
    hostPlayer: lobby.hostPlayer,
    hostSkin: lobby.hostSkin || null,
    players: Math.min(lobby.maxPlayers, 1 + lobby.players.length),
    updatedAt: lobby.updatedAt,
    ...(options.includeHostToken ? { hostToken: lobby.hostToken } : {})
  };
}

function sendSocketMessage(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    logger.warn('COOP_WS_SEND_FAIL', 'Falha ao enviar payload via WS', {
      error: error.message,
      payloadType: payload?.type
    });
  }
}

function buildRealtimePlayersSnapshot(mode = DEFAULT_COOP_MODE) {
  const lobby = getActiveLobby(mode);
  if (!lobby) return [];
  const realtime = getRealtimeChannel(mode);
  const snapshot = [];
  if (realtime.host) {
    snapshot.push({
      playerId: realtime.host.name || lobby.hostPlayer,
      name: realtime.host.name || lobby.hostPlayer,
      role: 'host',
      ready: Boolean(realtime.host.ready),
      skin: realtime.host.skin || lobby.hostSkin || null,
      progression: realtime.host.progression || null
    });
  } else if (lobby.hostPlayer) {
    snapshot.push({
      playerId: lobby.hostPlayer,
      name: lobby.hostPlayer,
      role: 'host',
      ready: false,
      skin: lobby.hostSkin || null,
      progression: null
    });
  }
  lobby.players.forEach(player => {
    const client = realtime.clients.get(player.name);
    snapshot.push({
      playerId: player.name,
      name: player.name,
      role: 'client',
      ready: Boolean(client?.ready),
      skin: client?.skin || player.skin || null,
      progression: client?.progression || null
    });
  });
  return snapshot;
}

function broadcastRealtime(mode, payload, { includeHost = true } = {}) {
  const realtime = getRealtimeChannel(mode);
  logger.info('COOP_WS_BROADCAST', 'Distribuindo payload em tempo real', {
    payloadType: payload?.type,
    includeHost,
    mode,
    connectedClients: realtime.clients.size,
    hasHost: Boolean(realtime.host)
  });
  if (includeHost && realtime.host?.socket) {
    sendSocketMessage(realtime.host.socket, payload);
  }
  realtime.clients.forEach(client => sendSocketMessage(client.socket, payload));
}

function notifyRealtimePlayers(mode = DEFAULT_COOP_MODE, reason = 'update') {
  const players = buildRealtimePlayersSnapshot(mode);
  logger.info('COOP_WS_PLAYERS', 'Snapshot de jogadores enviado', {
    reason,
    mode,
    players: players.map(player => ({ name: player.name, role: player.role, ready: player.ready }))
  });
  broadcastRealtime(mode, { type: 'players', reason, players });
}

function teardownCoopLobby(mode = DEFAULT_COOP_MODE, reason = 'host_left') {
  const key = normalizeCoopMode(mode);
  const lobby = coopServiceState.lobbies.get(key);
  if (!lobby) return;
  const realtime = getRealtimeChannel(key);
  logger.info('COOP_LOBBY_TEARDOWN', 'Encerrando lobby co-op', { reason, lobbyId: lobby.id, mode: key });
  broadcastRealtime(key, { type: 'lobby-closed', reason });
  if (realtime.host?.socket) {
    try { realtime.host.socket.close(1001, 'Lobby encerrado'); } catch (_) { }
  }
  realtime.clients.forEach(client => {
    try { client.socket.close(1001, 'Lobby encerrado'); } catch (_) { }
  });
  realtime.host = null;
  realtime.clients.clear();
  coopRealtimeState.delete(key);
  coopServiceState.lobbies.delete(key);
}

function handleCoopRealtimeMessage(session, rawData) {
  if (!session?.socket) return;
  const realtime = getRealtimeChannel(session.mode);
  let payload;
  try {
    payload = typeof rawData === 'string' ? JSON.parse(rawData) : JSON.parse(rawData.toString('utf8'));
  } catch (error) {
    logger.warn('COOP_WS_PARSE_FAIL', 'Payload WS inválido', {
      connectionId: session.id,
      role: session.role,
      error: error.message
    });
    return;
  }
  if (!payload || typeof payload !== 'object') return;

  const rawType = typeof payload.type === 'string' ? payload.type : '';
  const messageType = rawType.trim().toLowerCase();

  if (isClientStateMessage(messageType)) {
    handleClientStateBroadcast(session, payload);
    return;
  }

  switch (messageType) {
    case 'ping':
      sendSocketMessage(session.socket, { type: 'pong', timestamp: Date.now() });
      break;
    case 'ready':
      session.ready = Boolean(payload.ready);
      if (session.role === 'host' && realtime.host) {
        realtime.host.ready = session.ready;
      } else if (session.role === 'client') {
        const clientSlot = realtime.clients.get(session.name);
        if (clientSlot) clientSlot.ready = session.ready;
      }
      notifyRealtimePlayers(session.mode, 'ready-update');
      break;
    case 'state':
      if (session.role !== 'host') {
        sendSocketMessage(session.socket, {
          type: 'error',
          code: 'ONLY_HOST_CAN_BROADCAST',
          message: 'Somente o host pode transmitir estado.'
        });
        return;
      }
      broadcastRealtime(session.mode, {
        type: 'state',
        tick: payload.tick || Date.now(),
        payload: payload.payload || payload.state || null
      }, { includeHost: false });
      break;
    case 'event':
      if (session.role !== 'host') {
        sendSocketMessage(session.socket, {
          type: 'error',
          code: 'ONLY_HOST_CAN_BROADCAST',
          message: 'Somente o host pode enviar eventos globais.'
        });
        return;
      }
      broadcastRealtime(session.mode, {
        type: 'event',
        event: payload.event,
        data: payload.data || null,
        tick: payload.tick || Date.now()
      }, { includeHost: false });
      break;
    case 'input':
      if (session.role !== 'client') return;
      if (realtime.host?.socket) {
        sendSocketMessage(realtime.host.socket, {
          type: 'input',
          from: session.name,
          payload: payload.payload || payload.input || null,
          timestamp: Date.now()
        });
      }
      break;
    case 'client-event':
      if (session.role !== 'client') return;
      if (realtime.host?.socket) {
        sendSocketMessage(realtime.host.socket, {
          type: 'client-event',
          from: session.name,
          event: payload.event,
          data: payload.data || null,
          tick: payload.tick || Date.now()
        });
      }
      break;
    case 'progression': {
      const merged = sanitizeProgressionPayload(payload.progression || payload.data || {}, session.progression);
      if (!merged) return;
      session.progression = merged;
      if (session.role === 'client') {
        const clientSlot = realtime.clients.get(session.name);
        if (clientSlot) clientSlot.progression = merged;
      } else if (session.role === 'host' && realtime.host) {
        realtime.host.progression = merged;
      }
      notifyRealtimePlayers(session.mode, 'progression-update');
      break;
    }
    case 'chat': {
      const sanitized = String(payload.message || '').trim();
      if (!sanitized) return;
      broadcastRealtime(session.mode, {
        type: 'chat',
        from: session.name,
        role: session.role,
        message: sanitized.slice(0, 280),
        timestamp: Date.now()
      });
      break;
    }
    default:
      logger.warn('COOP_WS_UNKNOWN_MESSAGE', 'Tipo de payload WS não mapeado', {
        connectionId: session.id,
        role: session.role,
        payloadType: rawType || null,
        normalizedType: messageType || null
      });
  }
}

function handleCoopRealtimeClose(session, code, reasonBuffer) {
  if (!session) return;
  const realtime = getRealtimeChannel(session.mode);
  const reason = typeof reasonBuffer === 'string'
    ? reasonBuffer
    : reasonBuffer?.toString?.('utf8') || '';

  if (session.role === 'host') {
    logger.warn('COOP_WS_HOST_LEFT', 'Host desconectou do canal WS', {
      connectionId: session.id,
      code,
      reason
    });
    if (getActiveLobby(session.mode)) {
      teardownCoopLobby(session.mode, 'host_socket_closed');
    } else {
      realtime.host = null;
    }
    return;
  }

  realtime.clients.delete(session.name);
  const lobby = getActiveLobby(session.mode);
  if (lobby) {
    removeCoopPlayer(lobby, session.name);
    notifyRealtimePlayers(session.mode, 'client_disconnected');
  }
  logger.info('COOP_WS_CLIENT_LEFT', 'Cliente co-op desconectado', {
    connectionId: session.id,
    player: session.name,
    code,
    reason
  });
}

function normalizePlayerName(rawName) {
  return rawName ? rawName.toString().trim().slice(0, 32) : '';
}

function buildSkinPayloadFromParams(params) {
  if (!params) return null;
  const raw = {
    body: params.get('skinBody') || params.get('skin_body') || null,
    head: params.get('skinHead') || params.get('skin_head') || null,
    texture: params.get('skinTexture') || params.get('skin_texture') || null
  };
  return sanitizeSkinPayload(raw);
}

function setupCoopRealtimeServer() {
  const wsServer = new WebSocket.Server({ server: httpServer, path: COOP_WS_PATH });

  wsServer.on('connection', (socket, request) => {
    const connectionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url, `http://${request.headers.host}`);
    } catch (error) {
      logger.warn('COOP_WS_REJECT', 'URL inválida na conexão WS', { connectionId, error: error.message });
      try { socket.close(4400, 'URL inválida'); } catch (_) { }
      return;
    }

    const params = parsedUrl.searchParams;
    const requestedMode = normalizeCoopMode(params.get('mode'));
    const lobby = getActiveLobby(requestedMode);
    if (!lobby) {
      logger.warn('COOP_WS_REJECT', 'Conexão WS recusada: lobby ausente', { connectionId, mode: requestedMode });
      try { socket.close(4404, 'Lobby inativo'); } catch (_) { }
      return;
    }
    const realtime = getRealtimeChannel(requestedMode);
    const role = (params.get('role') || 'client').toLowerCase() === 'host' ? 'host' : 'client';
    const remoteAddress = request.socket?.remoteAddress || request.headers['x-forwarded-for'] || null;
    const readyFlag = params.get('ready');
    const initialReady = readyFlag === 'true' || readyFlag === '1';
    const skinFromParams = buildSkinPayloadFromParams(params);
    let session;

    if (role === 'host') {
      const hostToken = params.get('hostToken') || params.get('token');
      if (!hostToken || hostToken !== lobby.hostToken) {
        logger.warn('COOP_WS_REJECT', 'Host apresentou token inválido', { connectionId, lobbyId: lobby.id });
        try { socket.close(4403, 'Token inválido'); } catch (_) { }
        return;
      }
      const hostName = normalizePlayerName(params.get('player') || params.get('name') || lobby.hostPlayer || 'Host');
      if (realtime.host?.socket) {
        try { realtime.host.socket.close(4000, 'Host reconectando'); } catch (_) { }
      }
      if (skinFromParams) {
        lobby.hostSkin = mergeSkinData(lobby.hostSkin, skinFromParams);
      }
      session = {
        id: connectionId,
        role: 'host',
        name: hostName || lobby.hostPlayer || 'Host',
        mode: requestedMode,
        socket,
        ready: initialReady,
        address: remoteAddress,
        connectedAt: now(),
        skin: skinFromParams || lobby.hostSkin || null,
        progression: null
      };
      realtime.host = session;
    } else {
      const playerName = normalizePlayerName(params.get('player') || params.get('name'));
      if (!playerName) {
        try { socket.close(4400, 'Informe um codinome'); } catch (_) { }
        return;
      }
      const registration = registerCoopPlayer(lobby, playerName, {
        address: remoteAddress,
        skin: skinFromParams
      });
      if (!registration.ok) {
        const code = registration.reason === 'LOBBY_FULL' ? 4409 : 4403;
        try { socket.close(code, 'Não foi possível entrar no lobby'); } catch (_) { }
        return;
      }
      const existing = realtime.clients.get(playerName);
      if (existing?.socket && existing.socket !== socket) {
        try { existing.socket.close(4409, 'Sessão substituída'); } catch (_) { }
      }
      session = {
        id: connectionId,
        role: 'client',
        name: playerName,
        mode: requestedMode,
        socket,
        ready: initialReady,
        address: remoteAddress,
        connectedAt: now(),
        skin: registration.player?.skin || skinFromParams || null,
        progression: null
      };
      realtime.clients.set(playerName, session);
    }

    socket.on('message', data => handleCoopRealtimeMessage(session, data));
    socket.on('close', (code, reason) => handleCoopRealtimeClose(session, code, reason));
    socket.on('error', error => {
      logger.warn('COOP_WS_SOCKET_ERROR', 'Erro em conexão WS', {
        connectionId,
        role: session.role,
        error: error.message
      });
    });

    sendSocketMessage(socket, {
      type: 'welcome',
      role: session.role,
      lobby: summarizeLobby(lobby),
      players: buildRealtimePlayersSnapshot(session.mode),
      connectionId
    });

    logger.info('COOP_WS_CONNECTED', 'Conexão WebSocket estabelecida', {
      connectionId,
      role: session.role,
      player: session.name,
      lobbyId: lobby.id,
      mode: session.mode
    });
    notifyRealtimePlayers(session.mode, 'connection');
  });

  wsServer.on('error', error => {
    logger.error('COOP_WS_SERVER', 'Erro no servidor WebSocket', { error: error.message });
  });

  return wsServer;
}

const coopWsServer = setupCoopRealtimeServer();


async function ensureBaseSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Criar tabela players se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // Criar tabela player_profiles se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        id SERIAL PRIMARY KEY,
        player_id INTEGER UNIQUE NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        display_name VARCHAR(50),
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        total_kills INTEGER DEFAULT 0,
        total_deaths INTEGER DEFAULT 0,
        total_rounds_completed INTEGER DEFAULT 0,
        highest_round INTEGER DEFAULT 0,
        total_playtime_seconds INTEGER DEFAULT 0,
        avatar_url VARCHAR(255),
        br_wins INTEGER DEFAULT 0,
        br_games_played INTEGER DEFAULT 0,
        br_total_kills INTEGER DEFAULT 0,
        br_best_position INTEGER DEFAULT 0,
        tactical_wins INTEGER DEFAULT 0,
        tactical_games_played INTEGER DEFAULT 0,
        tactical_total_kills INTEGER DEFAULT 0,
        tactical_best_rank INTEGER DEFAULT 0,
        skin_body VARCHAR(50) DEFAULT '#ff0000',
        skin_head VARCHAR(50) DEFAULT '#ff0000',
        skin_texture TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Criar tabela high_scores se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS high_scores (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        round_reached INTEGER NOT NULL,
        kills INTEGER DEFAULT 0,
        accuracy DECIMAL(5,2) DEFAULT 0.00,
        playtime_seconds INTEGER DEFAULT 0,
        map_name VARCHAR(100) DEFAULT 'Default',
        game_mode VARCHAR(20) DEFAULT 'survival',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Criar tabela weapon_stats se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS weapon_stats (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        weapon_name VARCHAR(50) NOT NULL,
        game_mode VARCHAR(20) NOT NULL DEFAULT 'survival',
        total_shots INTEGER DEFAULT 0,
        total_hits INTEGER DEFAULT 0,
        total_kills INTEGER DEFAULT 0,
        total_headshots INTEGER DEFAULT 0,
        accuracy DECIMAL(5,2) DEFAULT 0.00,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, weapon_name, game_mode)
      );
    `);

    await client.query('COMMIT');
    logger.info('DB_SCHEMA', 'Esquema base do banco de dados verificado/criado com sucesso');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('DB_SCHEMA', 'Erro ao criar esquema base', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function ensureExtendedSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE player_profiles
        ADD COLUMN IF NOT EXISTS br_wins INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS br_games_played INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS br_total_kills INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS br_best_position INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tactical_wins INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tactical_games_played INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tactical_total_kills INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tactical_best_rank INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS skin_body VARCHAR(50) DEFAULT '#ff0000',
        ADD COLUMN IF NOT EXISTS skin_head VARCHAR(50) DEFAULT '#ff0000',
        ADD COLUMN IF NOT EXISTS skin_texture TEXT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mode_matches (
        id BIGSERIAL PRIMARY KEY,
        mode VARCHAR(20) NOT NULL CHECK (mode IN ('survival', 'battleroyale', 'tactical')),
        map_name VARCHAR(100) DEFAULT 'Default',
        queue_type VARCHAR(32) DEFAULT 'ranked',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0,
        rounds_played INTEGER DEFAULT 0,
        max_rounds INTEGER DEFAULT 0,
        winning_team VARCHAR(16),
        season VARCHAR(16),
        notes TEXT,
        created_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mode_match_participants (
        id BIGSERIAL PRIMARY KEY,
        match_id BIGINT NOT NULL REFERENCES mode_matches(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team VARCHAR(16),
        result VARCHAR(8) CHECK (result IN ('win', 'loss', 'draw')),
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        rounds_won INTEGER DEFAULT 0,
        rounds_lost INTEGER DEFAULT 0,
        plants INTEGER DEFAULT 0,
        defuses INTEGER DEFAULT 0,
        first_bloods INTEGER DEFAULT 0,
        adr NUMERIC(6,2) DEFAULT 0,
        economy_spent INTEGER DEFAULT 0,
        mmr_before INTEGER DEFAULT 1000,
        mmr_after INTEGER DEFAULT 1000,
        mmr_delta INTEGER DEFAULT 0,
        placement INTEGER,
        damage_done INTEGER DEFAULT 0,
        damage_taken INTEGER DEFAULT 0,
        was_mvp BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mode_match_rounds (
        id BIGSERIAL PRIMARY KEY,
        match_id BIGINT NOT NULL REFERENCES mode_matches(id) ON DELETE CASCADE,
        round_number SMALLINT NOT NULL,
        winning_team VARCHAR(16),
        win_condition VARCHAR(24),
        alpha_economy JSONB,
        bravo_economy JSONB,
        clutches JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(match_id, round_number)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS player_mode_stats (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        mode VARCHAR(20) NOT NULL CHECK (mode IN ('survival', 'battleroyale', 'tactical')),
        matches_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_rate NUMERIC(5,2) DEFAULT 0,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        damage_done INTEGER DEFAULT 0,
        damage_taken INTEGER DEFAULT 0,
        rounds_played INTEGER DEFAULT 0,
        best_score INTEGER DEFAULT 0,
        best_round INTEGER DEFAULT 0,
        best_position INTEGER DEFAULT 0,
        mmr_rating INTEGER DEFAULT 1000,
        rank_tier VARCHAR(32) DEFAULT 'PROVISIONAL',
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        top5_finishes INTEGER DEFAULT 0,
        clutches INTEGER DEFAULT 0,
        last_match_id BIGINT REFERENCES mode_matches(id),
        last_played_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, mode)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mode_matches_mode ON mode_matches(mode, ended_at DESC NULLS LAST, id DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mode_match_participants_match ON mode_match_participants(match_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mode_match_participants_player ON mode_match_participants(player_id, match_id DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_player_mode_stats_mode_rank ON player_mode_stats(mode, mmr_rating DESC, wins DESC);
    `);

    await client.query(`
      ALTER TABLE weapon_stats
        ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) NOT NULL DEFAULT 'survival';
    `);

    await client.query(`
      ALTER TABLE weapon_stats
      DROP CONSTRAINT IF EXISTS weapon_stats_player_id_weapon_name_key;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'weapon_stats_player_weapon_mode_key'
        ) THEN
          ALTER TABLE weapon_stats
          ADD CONSTRAINT weapon_stats_player_weapon_mode_key UNIQUE (player_id, weapon_name, game_mode);
        END IF;
      END;
      $$;
    `);

    // Criar tabela de mapas da comunidade se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_maps (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        author_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        map_data JSONB NOT NULL,
        downloads INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_community_maps_author ON community_maps(author_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_community_maps_created ON community_maps(created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('🗄️  Esquema do banco validado com sucesso.');
    logger.info('DB_SCHEMA', 'Esquema validado com sucesso.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao validar esquema do banco:', error);
    logger.error('DB_SCHEMA', 'Erro ao validar esquema do banco', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}


async function ensurePlayerModeStats(client, playerId, mode) {
  await client.query(`
    INSERT INTO player_mode_stats (player_id, mode)
    VALUES ($1, $2)
    ON CONFLICT (player_id, mode) DO NOTHING
  `, [playerId, mode]);
}

async function fetchPlayerModeStats(client, playerId, mode, forUpdate = false) {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const result = await client.query(
    `SELECT * FROM player_mode_stats WHERE player_id = $1 AND mode = $2 ${lockClause}`,
    [playerId, mode]
  );
  return result.rows[0] || null;
}

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Rate Limiting (separated buckets so long sessions don't break the menu)
const TELEMETRY_ENDPOINTS = ['/api/logs/client', '/api/weapons/stats', '/api/scores'];
const buildKey = (req) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1] || authHeader;
    return `token:${token}`;
  }
  if (req.headers['x-forwarded-for']) {
    return `xff:${req.headers['x-forwarded-for']}`;
  }
  return `ip:${req.ip}`;
};

const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 900,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: buildKey,
  skip: (req) => TELEMETRY_ENDPOINTS.some((endpoint) => req.originalUrl.startsWith(endpoint))
});

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 4000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: buildKey,
  skipFailedRequests: true
});

TELEMETRY_ENDPOINTS.forEach((path) => app.use(path, telemetryLimiter));
app.use('/api/', generalLimiter);

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'fps_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const attachUserIfPresent = (req, res, next) => {
  if (req.user) return next();
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
};

const buildLogMeta = (req, extra = {}) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
  userId: req.user?.id || null,
  ...extra
});

function resolveRequestMode(req, fallback = DEFAULT_COOP_MODE) {
  if (!req) return fallback;
  const candidate = req.query?.mode || req.body?.mode || fallback;
  return normalizeCoopMode(candidate);
}

// ==================== CO-OP ROUTES ====================
app.get('/coop/presence', (req, res) => {
  const mode = resolveRequestMode(req);
  res.json(getCoopPresencePayload(mode));
});

app.get('/coop/discovery', (req, res) => {
  const mode = resolveRequestMode(req);
  const lobby = getActiveLobby(mode);
  if (!lobby || !lobby.announce) {
    return res.json({ lobbies: [] });
  }
  const summary = summarizeLobby(lobby);
  res.json({ lobbies: [summary] });
});

app.post('/coop/host', (req, res) => {
  try {
    const mode = resolveRequestMode(req, req.body?.mode);
    const hostSkin = sanitizeSkinPayload(req.body?.skin || req.body?.hostSkin || req.body?.playerSkin);
    const lobby = ensureCoopLobby({ ...req.body, mode }, { hostIp: req.ip, hostSkin });
    logger.info('COOP_HOST', 'Lobby configurado', buildLogMeta(req, { lobbyId: lobby.id, mode: lobby.mode }));
    res.json({
      message: 'Lobby configurado. Abra o cliente Survival para iniciar como host.',
      lobby: summarizeLobby(lobby, { includeHostToken: true })
    });
  } catch (error) {
    logger.error('COOP_HOST', 'Erro ao configurar lobby', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Não foi possível configurar o lobby co-op.' });
  }
});

app.post('/coop/join', (req, res) => {
  const mode = resolveRequestMode(req);
  const lobby = getActiveLobby(mode);
  if (!lobby) {
    logger.warn('COOP_JOIN', 'Tentativa de conexão sem lobby ativo', buildLogMeta(req));
    return res.status(404).json({ error: 'Nenhum lobby co-op ativo foi encontrado.' });
  }

  const playerName = (req.body?.player || req.body?.codename || '').trim();
  if (!playerName) {
    return res.status(400).json({ error: 'Informe um codinome para entrar no lobby.' });
  }

  const playerSkin = sanitizeSkinPayload(req.body?.skin || req.body?.playerSkin);
  const registration = registerCoopPlayer(lobby, playerName, { address: req.ip, skin: playerSkin });
  if (!registration.ok) {
    if (registration.reason === 'LOBBY_FULL') {
      return res.status(409).json({ error: 'Lobby cheio. Aguarde vaga ou crie um novo host.' });
    }
    return res.status(500).json({ error: 'Não foi possível registrar sua entrada no lobby.' });
  }

  logger.info('COOP_JOIN', 'Jogador registrado no lobby', buildLogMeta(req, { lobbyId: lobby.id, playerName, mode: lobby.mode }));
  res.json({
    message: 'Lobby localizado! Abra o modo Survival para conectar como cliente.',
    lobby: summarizeLobby(lobby)
  });
});

app.post('/coop/heartbeat', (req, res) => {
  const mode = resolveRequestMode(req);
  const lobby = getActiveLobby(mode);
  if (!lobby) {
    return res.status(404).json({ error: 'Lobby não encontrado.' });
  }

  const role = (req.body?.role || 'client').toLowerCase();
  const playerName = (req.body?.player || '').trim();

  if (role === 'host') {
    const token = req.body?.hostToken;
    if (!token || token !== lobby.hostToken) {
      logger.warn('COOP_HEARTBEAT', 'Token de host inválido', buildLogMeta(req, { lobbyId: lobby.id }));
      return res.status(403).json({ error: 'Token do host inválido.' });
    }
    if (req.body?.port) {
      lobby.port = Math.min(Math.max(parseInt(req.body.port, 10) || lobby.port, 1024), 65535);
    }
    if (req.body?.interface) {
      lobby.interface = String(req.body.interface).slice(0, 64);
    }
    lobby.hostIp = req.ip;
    const skin = sanitizeSkinPayload(req.body?.skin || req.body?.hostSkin);
    if (skin) {
      lobby.hostSkin = mergeSkinData(lobby.hostSkin, skin);
    }
  } else {
    if (!playerName) {
      return res.status(400).json({ error: 'Informe o codinome do jogador.' });
    }
    const skin = sanitizeSkinPayload(req.body?.skin || req.body?.playerSkin);
    const registration = registerCoopPlayer(lobby, playerName, { address: req.ip, skin });
    if (!registration.ok) {
      const status = registration.reason === 'LOBBY_FULL' ? 409 : 400;
      return res.status(status).json({ error: 'Não foi possível atualizar sua presença no lobby.' });
    }
  }

  lobby.updatedAt = now();
  res.json({ lobby: summarizeLobby(lobby) });
});

app.delete('/coop/lobby', (req, res) => {
  const mode = resolveRequestMode(req);
  const lobby = getActiveLobby(mode);
  if (!lobby) {
    return res.status(404).json({ error: 'Lobby já estava inativo.' });
  }
  const token = req.body?.hostToken || req.query?.hostToken;
  if (!token || token !== lobby.hostToken) {
    return res.status(403).json({ error: 'Token do host inválido.' });
  }
  logger.info('COOP_LOBBY_SHUTDOWN', 'Lobby encerrado pelo host', { lobbyId: lobby.id, mode: lobby.mode });
  teardownCoopLobby(mode, 'host_shutdown_api');
  res.json({ message: 'Lobby encerrado.' });
});

// ==================== ROTAS DE AUTENTICAÇÃO ====================

// Registro de novo jogador
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    logger.warn('AUTH_REGISTER', 'Campos obrigatórios faltando', buildLogMeta(req, { username, email }));
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  try {
    // Verificar se usuário já existe
    const userExists = await pool.query(
      'SELECT id FROM players WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (userExists.rows.length > 0) {
      logger.warn('AUTH_REGISTER', 'Usuário ou email já cadastrado', buildLogMeta(req, { username, email }));
      return res.status(409).json({ error: 'Usuário ou email já cadastrado' });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserir jogador
    const result = await pool.query(
      'INSERT INTO players (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );

    const playerId = result.rows[0].id;

    // Criar perfil do jogador
    await pool.query(
      'INSERT INTO player_profiles (player_id, display_name) VALUES ($1, $2)',
      [playerId, displayName || username]
    );

    logger.info('AUTH_REGISTER', 'Jogador registrado com sucesso', buildLogMeta(req, { playerId, username }));

    res.status(201).json({
      message: 'Jogador registrado com sucesso',
      player: result.rows[0]
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    logger.error('AUTH_REGISTER', 'Erro ao registrar jogador', buildLogMeta(req, { username, error: error.message }));
    res.status(500).json({ error: 'Erro ao registrar jogador' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    logger.warn('AUTH_LOGIN', 'Campos obrigatórios faltando', buildLogMeta(req, { username }));
    return res.status(400).json({ error: 'Username e senha são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, email, password_hash, is_active FROM players WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      logger.security('AUTH_LOGIN', 'Tentativa com usuário inexistente', buildLogMeta(req, { username }));
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const player = result.rows[0];

    if (!player.is_active) {
      logger.security('AUTH_LOGIN', 'Conta desativada bloqueou login', buildLogMeta(req, { userId: player.id }));
      return res.status(403).json({ error: 'Conta desativada' });
    }

    const validPassword = await bcrypt.compare(password, player.password_hash);

    if (!validPassword) {
      logger.security('AUTH_LOGIN', 'Senha inválida', buildLogMeta(req, { userId: player.id }));
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Atualizar último login
    await pool.query('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [player.id]);

    // Gerar token JWT
    const token = jwt.sign(
      { id: player.id, username: player.username },
      process.env.JWT_SECRET || 'fps_jwt_super_secret_key_2024',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      player: {
        id: player.id,
        username: player.username,
        email: player.email
      }
    });
    logger.info('AUTH_LOGIN', 'Login realizado com sucesso', buildLogMeta(req, { userId: player.id }));
  } catch (error) {
    console.error('Erro no login:', error);
    logger.error('AUTH_LOGIN', 'Erro no login', buildLogMeta(req, { username, error: error.message }));
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// ==================== ROTAS DE PERFIL ====================

// Obter perfil do jogador
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, p.username, p.email, p.created_at, p.last_login,
        pp.display_name, pp.level, pp.experience, pp.total_kills, 
        pp.total_deaths, pp.total_rounds_completed, pp.highest_round,
        pp.total_playtime_seconds, pp.avatar_url,
        pp.br_wins, pp.br_games_played, pp.br_total_kills, pp.br_best_position,
        pp.tactical_wins, pp.tactical_games_played, pp.tactical_total_kills, pp.tactical_best_rank,
        pp.skin_body, pp.skin_head, pp.skin_texture
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao finalizar sessão:', error);
    logger.error('PROFILE_GET', 'Erro ao buscar perfil', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao finalizar sessão' });
  }
});

// Atualizar perfil
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { displayName, avatarUrl, skinBody, skinHead, skinTexture } = req.body;
  const skinTextureProvided = Object.prototype.hasOwnProperty.call(req.body, 'skinTexture');

  try {
    const result = await pool.query(`
      UPDATE player_profiles 
      SET display_name = COALESCE($1, display_name),
          avatar_url = COALESCE($2, avatar_url),
          skin_body = COALESCE($3, skin_body),
          skin_head = COALESCE($4, skin_head),
          skin_texture = CASE WHEN $6 = FALSE THEN skin_texture ELSE $5 END
      WHERE player_id = $7
      RETURNING *
    `, [displayName, avatarUrl, skinBody, skinHead, skinTexture, skinTextureProvided, req.user.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    logger.error('PROFILE_UPDATE', 'Erro ao atualizar perfil', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// ==================== ROTAS DE ESTATÍSTICAS ====================

app.post('/api/logs/client', attachUserIfPresent, async (req, res) => {
  const { level = 'info', scope = 'CLIENT', message = 'Evento do cliente', meta = {} } = req.body || {};
  const entryMeta = { ...buildLogMeta(req), ...meta };
  try {
    logger.client(level, scope, message, entryMeta);
    res.status(204).end();
  } catch (error) {
    logger.error('CLIENT_LOG', 'Falha ao registrar log do cliente', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao registrar log do cliente' });
  }
});

// Obter estatísticas detalhadas
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    // Usar player_profiles para garantir dados atualizados de BR e Survival
    const stats = await pool.query(`
      SELECT 
        p.id, p.username, 
        pp.*
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.id = $1
    `, [req.user.id]);

    const weaponStats = await pool.query(`
      SELECT * FROM weapon_stats WHERE player_id = $1 ORDER BY total_kills DESC
    `, [req.user.id]);

    const recentSessions = await pool.query(`
      SELECT * FROM game_sessions 
      WHERE player_id = $1 
      ORDER BY start_time DESC 
      LIMIT 10
    `, [req.user.id]);

    res.json({
      profile: stats.rows[0] || {},
      weapons: weaponStats.rows,
      recentSessions: recentSessions.rows
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    logger.error('STATS_GET', 'Erro ao buscar estatísticas', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// ==================== ROTAS DE PONTUAÇÃO ====================

// Salvar pontuação
app.post('/api/scores', authenticateToken, async (req, res) => {
  const { score, roundReached, kills, accuracy, playtimeSeconds, mapName } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO high_scores (player_id, score, round_reached, kills, accuracy, playtime_seconds, map_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, score, roundReached, kills, accuracy || 0, playtimeSeconds || 0, mapName || 'Default']);

    const survivalXpGain = Math.max(
      SURVIVAL_MIN_XP,
      Math.floor((score || 0) * SURVIVAL_XP_MULTIPLIER)
    );

    // Atualizar perfil do jogador
    await pool.query(`
      UPDATE player_profiles 
      SET 
        total_kills = total_kills + $1,
        total_rounds_completed = total_rounds_completed + $2,
        highest_round = GREATEST(highest_round, $3),
        total_playtime_seconds = total_playtime_seconds + $4,
        experience = experience + $5
      WHERE player_id = $6
    `, [kills, roundReached, roundReached, playtimeSeconds, survivalXpGain, req.user.id]);

    // Calcular novo nível
    const expResult = await pool.query(`
      UPDATE player_profiles 
      SET level = calculate_level(experience)
      WHERE player_id = $1
      RETURNING level, experience
    `, [req.user.id]);

    res.json({
      highScore: result.rows[0],
      newLevel: expResult.rows[0].level,
      totalExperience: expResult.rows[0].experience
    });
    logger.gameplay('SURVIVAL_SCORE', 'Pontuação registrada', buildLogMeta(req, {
      scoreId: result.rows[0].id,
      roundReached,
      kills
    }));
  } catch (error) {
    console.error('Erro ao salvar pontuação:', error);
    logger.error('SURVIVAL_SCORE', 'Erro ao salvar pontuação', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao salvar pontuação' });
  }
});

// Obter melhores pontuações do jogador
app.get('/api/scores/personal', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM high_scores 
      WHERE player_id = $1 
      ORDER BY score DESC 
      LIMIT 10
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar pontuações:', error);
    logger.error('SURVIVAL_SCORE', 'Erro ao buscar pontuações pessoais', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao buscar pontuações' });
  }
});

// ==================== ROTAS DE LEADERBOARD ====================

// Leaderboard global
app.get('/api/leaderboard', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;

  try {
    const result = await pool.query(`
      SELECT * FROM leaderboard LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard' });
  }
});

// Leaderboard por round
app.get('/api/leaderboard/rounds', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.username,
        pp.display_name,
        pp.level,
        pp.highest_round,
        RANK() OVER (ORDER BY pp.highest_round DESC) as rank
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.is_active = TRUE
      ORDER BY pp.highest_round DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard de rounds:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard' });
  }
});

// Leaderboard Battle Royale (Vitórias)
app.get('/api/leaderboard/br-wins', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.username,
        pp.display_name,
        pp.level,
        pp.br_wins as score,
        RANK() OVER (ORDER BY pp.br_wins DESC) as rank
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.is_active = TRUE AND pp.br_wins > 0
      ORDER BY pp.br_wins DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard BR:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard BR' });
  }
});

// Leaderboard por Kills (Survival)
app.get('/api/leaderboard/kills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.username,
        pp.display_name,
        pp.level,
        pp.total_kills,
        RANK() OVER (ORDER BY pp.total_kills DESC) as rank
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.is_active = TRUE
      ORDER BY pp.total_kills DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard de kills:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard' });
  }
});

// Leaderboard Battle Royale (Kills)
app.get('/api/leaderboard/br-kills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.username,
        pp.display_name,
        pp.level,
        pp.br_total_kills,
        RANK() OVER (ORDER BY pp.br_total_kills DESC) as rank
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.is_active = TRUE AND pp.br_total_kills > 0
      ORDER BY pp.br_total_kills DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard BR Kills:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard BR Kills' });
  }
});

// Leaderboard por modo unificado
app.get('/api/leaderboard/modes', async (req, res) => {
  const mode = normalizeMode(req.query.mode);
  const metric = req.query.metric || 'mmr';
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  const orderClause = getLeaderboardSort(metric);

  try {
    const result = await pool.query(`
      SELECT 
        p.username,
        pp.display_name,
        pp.level,
        pms.mode,
        pms.matches_played,
        pms.wins,
        pms.losses,
        pms.win_rate,
        pms.kills,
        pms.deaths,
        pms.assists,
        pms.mmr_rating,
        pms.rank_tier,
        pms.best_score,
        pms.best_round,
        pms.best_position,
        pms.top5_finishes,
        pms.current_streak,
        pms.longest_streak,
        RANK() OVER (ORDER BY ${orderClause}) as rank
      FROM player_mode_stats pms
      JOIN players p ON p.id = pms.player_id
      JOIN player_profiles pp ON pp.player_id = pms.player_id
      WHERE p.is_active = TRUE AND pms.mode = $1
      ORDER BY ${orderClause}
      LIMIT $2
    `, [mode, limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard por modo:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard por modo' });
  }
});

// ==================== ROTAS DE PARTIDAS POR MODO ====================

app.get('/api/matches', async (req, res) => {
  const mode = normalizeMode(req.query.mode);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const playerFilter = toNullableInt(req.query.playerId);

  const params = [mode];
  let whereClause = 'WHERE m.mode = $1';

  if (playerFilter !== null) {
    params.push(playerFilter);
    whereClause += ` AND EXISTS (SELECT 1 FROM mode_match_participants mp_sub WHERE mp_sub.match_id = m.id AND mp_sub.player_id = $${params.length})`;
  }

  params.push(limit);
  const limitParamIndex = params.length;

  try {
    const result = await pool.query(`
      SELECT 
        m.*,
        COALESCE(
          json_agg(
            json_build_object(
              'playerId', mp.player_id,
              'team', mp.team,
              'result', mp.result,
              'kills', mp.kills,
              'deaths', mp.deaths,
              'assists', mp.assists,
              'score', mp.score,
              'roundsWon', mp.rounds_won,
              'roundsLost', mp.rounds_lost,
              'plants', mp.plants,
              'defuses', mp.defuses,
              'firstBloods', mp.first_bloods,
              'adr', mp.adr,
              'economySpent', mp.economy_spent,
              'mmrBefore', mp.mmr_before,
              'mmrAfter', mp.mmr_after,
              'mmrDelta', mp.mmr_delta,
              'placement', mp.placement,
              'damageDone', mp.damage_done,
              'damageTaken', mp.damage_taken,
              'wasMvp', mp.was_mvp,
              'displayName', pp.display_name,
              'level', pp.level
            ) ORDER BY mp.score DESC
          ) FILTER (WHERE mp.id IS NOT NULL),
          '[]'::json
        ) AS participants
      FROM mode_matches m
      LEFT JOIN mode_match_participants mp ON mp.match_id = m.id
      LEFT JOIN player_profiles pp ON pp.player_id = mp.player_id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.ended_at DESC NULLS LAST, m.id DESC
      LIMIT $${limitParamIndex}
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar partidas por modo:', error);
    logger.error('MATCHES_LIST', 'Erro ao buscar partidas por modo', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao buscar partidas' });
  }
});

app.post('/api/matches', authenticateToken, async (req, res) => {
  const {
    mode,
    mapName,
    queueType,
    durationSeconds,
    roundsPlayed,
    maxRounds,
    winningTeam,
    season,
    notes,
    endedAt,
    participants
  } = req.body;

  const normalizedMode = normalizeMode(mode);

  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'Lista de participantes é obrigatória' });
  }

  if (!participants.some((p) => toInt(p.playerId, 0) === req.user.id)) {
    return res.status(403).json({ error: 'O jogador precisa estar presente entre os participantes' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const parsedEndedAt = (() => {
      if (!endedAt) return new Date();
      const candidate = new Date(endedAt);
      return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
    })();

    const matchResult = await client.query(`
      INSERT INTO mode_matches (mode, map_name, queue_type, duration_seconds, rounds_played, max_rounds, winning_team, season, notes, created_by, ended_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      normalizedMode,
      mapName || 'Default',
      queueType || 'ranked',
      durationSeconds || 0,
      roundsPlayed || 0,
      maxRounds || 0,
      winningTeam || null,
      season || null,
      typeof notes === 'object' && notes !== null ? JSON.stringify(notes) : notes || null,
      req.user.id,
      parsedEndedAt
    ]);

    const matchId = matchResult.rows[0].id;
    const savedParticipants = [];

    for (const rawParticipant of participants) {
      const playerId = toInt(rawParticipant.playerId, 0);
      if (!playerId) {
        throw new Error('Participante sem playerId definido');
      }

      const normalizedResult = (() => {
        const explicit = (rawParticipant.result || '').toString().toLowerCase();
        if (['win', 'loss', 'draw'].includes(explicit)) return explicit;
        if (winningTeam && rawParticipant.team && winningTeam === rawParticipant.team) return 'win';
        if (winningTeam) return 'loss';
        return 'draw';
      })();

      const kills = toInt(rawParticipant.kills);
      const deaths = toInt(rawParticipant.deaths);
      const assists = toInt(rawParticipant.assists);
      const roundsWonVal = toInt(rawParticipant.roundsWon);
      const roundsLostVal = toInt(rawParticipant.roundsLost);
      const roundsContribution = rawParticipant.roundsPlayed !== undefined
        ? toInt(rawParticipant.roundsPlayed)
        : (roundsWonVal + roundsLostVal) || roundsPlayed || 0;
      const scoreValue = toInt(rawParticipant.score);
      const bestRound = rawParticipant.bestRound !== undefined
        ? toInt(rawParticipant.bestRound)
        : roundsWonVal;
      const placementValue = toNullableInt(rawParticipant.placement);
      const plantsValue = toInt(rawParticipant.plants);
      const defusesValue = toInt(rawParticipant.defuses);
      const firstBloodsValue = toInt(rawParticipant.firstBloods);
      const adrValue = toFloat(rawParticipant.adr);
      const economySpent = toInt(rawParticipant.economySpent);
      const damageDone = toInt(rawParticipant.damageDone);
      const damageTaken = toInt(rawParticipant.damageTaken);
      const clutchesValue = toInt(rawParticipant.clutches);
      const wasMvp = toBool(rawParticipant.wasMvp);

      await ensurePlayerModeStats(client, playerId, normalizedMode);
      const playerModeRow = await fetchPlayerModeStats(client, playerId, normalizedMode, true);
      const mmrBefore = playerModeRow?.mmr_rating || 1000;
      const mmrDelta = calculateMmrDelta(normalizedMode, normalizedResult, {
        kills,
        roundsWon: roundsWonVal,
        placement: placementValue
      });
      const mmrAfter = Math.max(0, mmrBefore + mmrDelta);

      const participantResult = await client.query(`
        INSERT INTO mode_match_participants (
          match_id, player_id, team, result, kills, deaths, assists, score, rounds_won, rounds_lost, plants, defuses,
          first_bloods, adr, economy_spent, mmr_before, mmr_after, mmr_delta, placement, damage_done, damage_taken, was_mvp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        RETURNING *
      `, [
        matchId,
        playerId,
        rawParticipant.team || null,
        normalizedResult,
        kills,
        deaths,
        assists,
        scoreValue,
        roundsWonVal,
        roundsLostVal,
        plantsValue,
        defusesValue,
        firstBloodsValue,
        adrValue,
        economySpent,
        mmrBefore,
        mmrAfter,
        mmrDelta,
        placementValue,
        damageDone,
        damageTaken,
        wasMvp
      ]);

      savedParticipants.push(participantResult.rows[0]);

      await client.query(`
        UPDATE player_mode_stats
        SET matches_played = matches_played + 1,
            wins = wins + CASE WHEN $4 = 'win' THEN 1 ELSE 0 END,
            losses = losses + CASE WHEN $4 = 'loss' THEN 1 ELSE 0 END,
            kills = kills + $5,
            deaths = deaths + $6,
            assists = assists + $7,
            damage_done = damage_done + $8,
            damage_taken = damage_taken + $9,
            rounds_played = rounds_played + $10,
            best_score = GREATEST(best_score, $11),
            best_round = CASE WHEN $12 > 0 THEN GREATEST(best_round, $12) ELSE best_round END,
            best_position = CASE 
              WHEN $2 = 'battleroyale' AND $13 IS NOT NULL THEN 
                CASE WHEN best_position = 0 THEN $13 ELSE LEAST(best_position, $13) END
              ELSE best_position
            END,
            mmr_rating = GREATEST(0, $14),
            win_rate = CASE 
              WHEN matches_played + 1 > 0 THEN ROUND(((wins + CASE WHEN $4 = 'win' THEN 1 ELSE 0 END)::NUMERIC / (matches_played + 1)) * 100, 2)
              ELSE 0
            END,
            current_streak = CASE 
              WHEN $4 = 'win' THEN GREATEST(current_streak, 0) + 1
              WHEN $4 = 'loss' THEN LEAST(current_streak, 0) - 1
              ELSE current_streak
            END,
            longest_streak = CASE 
              WHEN $4 = 'win' THEN GREATEST(longest_streak, GREATEST(current_streak, 0) + 1)
              ELSE longest_streak
            END,
            top5_finishes = CASE 
              WHEN $2 = 'battleroyale' AND $13 IS NOT NULL AND $13 <= 5 THEN top5_finishes + 1
              ELSE top5_finishes
            END,
            clutches = clutches + COALESCE($15, 0),
            last_match_id = $1,
            last_played_at = NOW(),
            updated_at = NOW()
        WHERE player_id = $3 AND mode = $2
      `, [
        matchId,
        normalizedMode,
        playerId,
        normalizedResult,
        kills,
        deaths,
        assists,
        damageDone,
        damageTaken,
        roundsContribution,
        scoreValue,
        bestRound,
        placementValue,
        mmrAfter,
        clutchesValue
      ]);
    }

    await client.query('COMMIT');
    res.status(201).json({ match: matchResult.rows[0], participants: savedParticipants });
    logger.gameplay('MATCH_RECORD', 'Partida registrada', buildLogMeta(req, {
      matchId,
      mode: normalizedMode,
      participants: participants.length,
      queueType: queueType || 'ranked'
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar partida:', error);
    logger.error('MATCH_RECORD', 'Erro ao registrar partida', buildLogMeta(req, { error: error.message, mode: normalizedMode }));
    res.status(500).json({ error: 'Erro ao registrar partida' });
  } finally {
    client.release();
  }
});

// ==================== ROTAS DE CONQUISTAS ====================

// Listar todas as conquistas
app.get('/api/achievements', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM achievements ORDER BY points ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar conquistas:', error);
    logger.error('ACHIEVEMENTS', 'Erro ao buscar conquistas', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao buscar conquistas' });
  }
});

// Conquistas do jogador
app.get('/api/achievements/player', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, pa.unlocked_at
      FROM achievements a
      LEFT JOIN player_achievements pa ON a.id = pa.achievement_id AND pa.player_id = $1
      ORDER BY a.points ASC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar conquistas do jogador:', error);
    logger.error('ACHIEVEMENTS', 'Erro ao buscar conquistas do jogador', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao buscar conquistas' });
  }
});

// Desbloquear conquista
app.post('/api/achievements/unlock/:achievementId', authenticateToken, async (req, res) => {
  const { achievementId } = req.params;

  try {
    const result = await pool.query(`
      INSERT INTO player_achievements (player_id, achievement_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id, achievement_id) DO NOTHING
      RETURNING *
    `, [req.user.id, achievementId]);

    if (result.rows.length > 0) {
      res.json({ message: 'Conquista desbloqueada!', achievement: result.rows[0] });
    } else {
      res.json({ message: 'Conquista já estava desbloqueada' });
    }
  } catch (error) {
    console.error('Erro ao desbloquear conquista:', error);
    logger.error('ACHIEVEMENTS', 'Erro ao desbloquear conquista', buildLogMeta(req, { error: error.message, achievementId }));
    res.status(500).json({ error: 'Erro ao desbloquear conquista' });
  }
});

// ==================== ROTAS DE SESSÃO DE JOGO ====================

// Iniciar sessão
app.post('/api/session/start', authenticateToken, async (req, res) => {
  const { mapName } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO game_sessions (player_id, map_name)
      VALUES ($1, $2)
      RETURNING *
    `, [req.user.id, mapName || 'Default']);

    res.json(result.rows[0]);
    logger.gameplay('SESSION_START', 'Sessão iniciada', buildLogMeta(req, {
      sessionId: result.rows[0].id,
      mapName: result.rows[0].map_name
    }));
  } catch (error) {
    console.error('Erro ao iniciar sessão:', error);
    logger.error('SESSION_START', 'Erro ao iniciar sessão', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao iniciar sessão' });
  }
});

// Finalizar sessão
app.put('/api/session/end/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { roundsCompleted, finalRound, totalKills, totalScore } = req.body;

  try {
    const result = await pool.query(`
      UPDATE game_sessions 
      SET 
        end_time = CURRENT_TIMESTAMP,
        rounds_completed = $1,
        final_round = $2,
        total_kills = $3,
        total_score = $4
      WHERE id = $5 AND player_id = $6
      RETURNING *
    `, [roundsCompleted, finalRound, totalKills, totalScore, sessionId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sessão não encontrada ou não pertence ao jogador' });
    }

    res.json(result.rows[0]);
    logger.gameplay('SESSION_END', 'Sessão finalizada', buildLogMeta(req, {
      sessionId,
      roundsCompleted,
      finalRound
    }));
  } catch (error) {
    console.error('Erro ao finalizar sessão:', error);
    logger.error('SESSION_END', 'Erro ao finalizar sessão', buildLogMeta(req, { error: error.message, sessionId }));
    res.status(500).json({ error: 'Erro ao finalizar sessão' });
  }
});

// ==================== ROTAS DE ESTATÍSTICAS DE ARMAS ====================

// Atualizar estatísticas de arma
app.post('/api/weapons/stats', authenticateToken, async (req, res) => {
  const { weaponName, shots, hits, kills, headshots, gameMode } = req.body;
  const normalizedMode = (gameMode || 'survival').toLowerCase();
  const acceptedModes = ['survival', 'battleroyale', 'tactical'];
  const mode = acceptedModes.includes(normalizedMode) ? normalizedMode : 'survival';

  try {
    const result = await pool.query(`
      INSERT INTO weapon_stats (player_id, weapon_name, game_mode, total_shots, total_hits, total_kills, total_headshots)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (player_id, weapon_name, game_mode) 
      DO UPDATE SET
        total_shots = weapon_stats.total_shots + $4,
        total_hits = weapon_stats.total_hits + $5,
        total_kills = weapon_stats.total_kills + $6,
        total_headshots = weapon_stats.total_headshots + $7,
        accuracy = CASE 
          WHEN weapon_stats.total_shots + $4 > 0 
          THEN ROUND((weapon_stats.total_hits + $5)::NUMERIC / (weapon_stats.total_shots + $4) * 100, 2)
          ELSE 0 
        END
      RETURNING *
    `, [req.user.id, weaponName, mode, shots, hits, kills, headshots]);

    res.json(result.rows[0]);
    logger.gameplay('WEAPON_STATS', 'Estatísticas de arma atualizadas', buildLogMeta(req, {
      weapon: weaponName,
      mode,
      kills,
      shots
    }));
  } catch (error) {
    console.error('Erro ao atualizar stats de arma:', error);
    logger.error('WEAPON_STATS', 'Erro ao atualizar stats de arma', buildLogMeta(req, { error: error.message, weapon: weaponName }));
    res.status(500).json({ error: 'Erro ao atualizar estatísticas' });
  }
});

// ==================== ROTAS DE TACTICAL (5v5) ====================

// Salvar estatísticas de partida tática (5v5)
app.post('/api/stats/tactical', authenticateToken, async (req, res) => {
  const { won, roundsWon, kills, rank } = req.body;

  try {
    // XP para modo tático — diferente do Survival/BR
    const tacticalWinXp = won ? 180 : 40;
    const tacticalKillXp = Math.max(0, kills) * 10;
    const xpGain = tacticalWinXp + tacticalKillXp;

    const result = await pool.query(`
      UPDATE player_profiles 
      SET 
        tactical_games_played = tactical_games_played + 1,
        tactical_wins = tactical_wins + $1,
        tactical_total_kills = tactical_total_kills + $2,
        tactical_best_rank = CASE WHEN tactical_best_rank = 0 THEN $3 ELSE LEAST(tactical_best_rank, $3) END,
        experience = experience + $4
      WHERE player_id = $5
      RETURNING *
    `, [won ? 1 : 0, kills, rank || 0, xpGain, req.user.id]);

    // Recalcular nível
    const expResult = await pool.query(`
      UPDATE player_profiles 
      SET level = calculate_level(experience)
      WHERE player_id = $1
      RETURNING level, experience
    `, [req.user.id]);

    res.json({
      profile: result.rows[0],
      newLevel: expResult.rows[0].level,
      totalExperience: expResult.rows[0].experience
    });
    logger.gameplay('TACTICAL_STATS', 'Estatísticas táticas registradas', buildLogMeta(req, {
      won,
      roundsWon,
      kills,
      rank
    }));
  } catch (error) {
    console.error('Erro ao salvar stats táticos:', error);
    logger.error('TACTICAL_STATS', 'Erro ao salvar stats táticos', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao salvar stats táticos' });
  }
});

// Leaderboard Tactical (Wins)
app.get('/api/leaderboard/tactical-wins', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.username,
        pp.display_name,
        pp.level,
        pp.tactical_wins as score,
        RANK() OVER (ORDER BY pp.tactical_wins DESC) as rank
      FROM players p
      JOIN player_profiles pp ON p.id = pp.player_id
      WHERE p.is_active = TRUE AND pp.tactical_wins > 0
      ORDER BY pp.tactical_wins DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar leaderboard Tactical:', error);
    res.status(500).json({ error: 'Erro ao buscar leaderboard Tactical' });
  }
});

// ==================== ROTA DE SAÚDE ====================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(503).json({ status: 'ERROR', database: 'Disconnected' });
  }
});

// ==================== ROTA RAIZ ====================

app.get('/', (req, res) => {
  res.json({
    message: 'FPS 3D Game API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/*',
      profile: '/api/profile',
      stats: '/api/stats',
      scores: '/api/scores/*',
      leaderboard: '/api/leaderboard',
      achievements: '/api/achievements/*',
      session: '/api/session/*',
      weapons: '/api/weapons/*'
    }
  });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  logger.error('UNHANDLED', 'Erro não tratado', buildLogMeta(req, { error: err.message, stack: err.stack }));
  res.status(500).json({ error: 'Algo deu errado!' });
});

async function startServer() {
  try {
    await ensureBaseSchema();
    await ensureExtendedSchema();

    if (process.env.NODE_ENV !== 'test') {
      httpServer.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 API disponível em http://localhost:${PORT}`);
        console.log(`🗄️  Conectado ao banco de dados PostgreSQL`);
        console.log(`🔌 Canal co-op WebSocket em ws://localhost:${PORT}${COOP_WS_PATH}`);
        logger.info('SERVER_START', 'Servidor iniciado', { port: PORT, nodeEnv: process.env.NODE_ENV });
      });
    }
  } catch (error) {
    console.error('Falha ao iniciar servidor:', error);
    logger.error('SERVER_START', 'Falha ao iniciar servidor', { error: error.message });
    process.exit(1);
  }
}

startServer();

// Tratamento de shutdown gracioso
process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido, fechando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT recebido, fechando servidor...');
  await pool.end();
  process.exit(0);
});

// ==================== ROTAS DE BATTLE ROYALE ====================

// Salvar estatísticas de Battle Royale
app.post('/api/stats/br', authenticateToken, async (req, res) => {
  const { won, position, kills } = req.body;

  try {
    const brXpGain = (won ? BR_WIN_XP : BR_MATCH_XP) + (Math.max(0, kills) * BR_KILL_XP);

    // Atualizar perfil do jogador com stats de BR
    const result = await pool.query(`
      UPDATE player_profiles 
      SET 
        br_games_played = br_games_played + 1,
        br_wins = br_wins + $1,
        br_total_kills = br_total_kills + $2,
        br_best_position = CASE 
          WHEN br_best_position = 0 THEN $3 
          ELSE LEAST(br_best_position, $3) 
        END,
        experience = experience + $4
      WHERE player_id = $5
      RETURNING *
    `, [
      won ? 1 : 0,
      kills,
      position,
      brXpGain,
      req.user.id
    ]);

    // Calcular novo nível
    const expResult = await pool.query(`
      UPDATE player_profiles 
      SET level = calculate_level(experience)
      WHERE player_id = $1
      RETURNING level, experience
    `, [req.user.id]);

    res.json({
      profile: result.rows[0],
      newLevel: expResult.rows[0].level,
      totalExperience: expResult.rows[0].experience
    });
    logger.gameplay('BR_STATS', 'Estatísticas de Battle Royale salvas', buildLogMeta(req, {
      won,
      position,
      kills
    }));
  } catch (error) {
    console.error('Erro ao salvar stats BR:', error);
    logger.error('BR_STATS', 'Erro ao salvar stats BR', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao salvar stats BR' });
  }
});

// ==================== ROTAS DE MAPAS DA COMUNIDADE ====================

// Listar mapas
app.get('/api/maps', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.name, m.description, m.downloads, m.likes, m.created_at, p.username as author_name 
      FROM community_maps m
      JOIN players p ON m.author_id = p.id
      ORDER BY m.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar mapas:', error);
    // Se a tabela não existe, retornar array vazio com aviso
    if (error.code === '42P01') {
      console.log('Tabela community_maps não existe. Execute init.sql para criar.');
      return res.json([]); // Retorna array vazio para não quebrar o frontend
    }
    logger.error('MAPS', 'Erro ao listar mapas', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao listar mapas' });
  }
});

// Obter detalhes de um mapa (incluindo dados JSON)
app.get('/api/maps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT m.*, p.username as author_name 
      FROM community_maps m
      JOIN players p ON m.author_id = p.id
      WHERE m.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapa não encontrado' });
    }

    const map = result.rows[0];
    if (typeof map.map_data === 'string') {
      try {
        map.map_data = JSON.parse(map.map_data);
      } catch (parseError) {
        console.warn('Falha ao converter JSON do mapa:', parseError.message);
      }
    }

    res.json(map);
  } catch (error) {
    console.error('Erro ao buscar mapa:', error);
    logger.error('MAPS', 'Erro ao buscar mapa', buildLogMeta(req, { error: error.message, id }));
    res.status(500).json({ error: 'Erro ao buscar mapa' });
  }
});

// Upload de mapa (Requer autenticação)
app.post('/api/maps', authenticateToken, async (req, res) => {
  const { name, description, map_data } = req.body;
  const author_id = req.user.id;

  if (!name || !map_data) {
    return res.status(400).json({ error: 'Nome e dados do mapa são obrigatórios' });
  }

  let parsedMapData = map_data;
  if (typeof parsedMapData === 'string') {
    try {
      parsedMapData = JSON.parse(parsedMapData);
    } catch (error) {
      return res.status(400).json({ error: 'JSON do mapa inválido' });
    }
  }

  if (typeof parsedMapData !== 'object' || parsedMapData === null) {
    return res.status(400).json({ error: 'Estrutura do mapa inválida' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO community_maps (name, description, author_id, map_data) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, description, author_id, JSON.stringify(parsedMapData)]
    );
    res.status(201).json({ id: result.rows[0].id, message: 'Mapa publicado com sucesso!' });
    logger.info('MAPS', 'Mapa publicado', buildLogMeta(req, { mapId: result.rows[0].id, name }));
  } catch (error) {
    console.error('Erro ao publicar mapa:', error);
    logger.error('MAPS', 'Erro ao publicar mapa', buildLogMeta(req, { error: error.message }));
    res.status(500).json({ error: 'Erro ao publicar mapa' });
  }
});

// Incrementar downloads
app.post('/api/maps/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE community_maps SET downloads = downloads + 1 WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao registrar download:', error);
    logger.error('MAPS', 'Erro ao registrar download de mapa', buildLogMeta(req, { error: error.message, id }));
    res.status(500).json({ error: 'Erro ao registrar download' });
  }
});

module.exports = { app, pool, httpServer, coopWsServer };