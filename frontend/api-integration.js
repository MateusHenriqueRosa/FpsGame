// ==========================================
// GUIA DE INTEGRAÇÃO DA API COM O JOGO
// ==========================================
// Adicione este código ao seu game.html (fps_game_complete.html)

// Configuração da API
const API_CONFIG = {
    baseUrl: window.location.origin + '/api',
    token: localStorage.getItem('token'),
    player: JSON.parse(localStorage.getItem('player') || 'null')
};

const CLIENT_LOG_ENDPOINT = `${API_CONFIG.baseUrl}/logs/client`;

function normalizeLogMeta(meta) {
    if (!meta) return {};
    if (typeof meta === 'object' && !Array.isArray(meta)) return meta;
    return { detail: String(meta) };
}

async function sendClientLog(level = 'info', scope = 'CLIENT', message = '', meta = {}) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (API_CONFIG.token) {
            headers.Authorization = `Bearer ${API_CONFIG.token}`;
        }
        await fetch(CLIENT_LOG_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({ level, scope, message, meta: normalizeLogMeta(meta) })
        });
    } catch (error) {
        console.warn('Falha ao enviar log do cliente', error);
    }
}

const clientLogs = {
    info: (scope, message, meta) => sendClientLog('info', scope, message, meta),
    warn: (scope, message, meta) => sendClientLog('warn', scope, message, meta),
    error: (scope, message, meta) => sendClientLog('error', scope, message, meta)
};

const CURRENT_GAME_MODE = (() => {
    const params = new URLSearchParams(window.location.search);
    const forcedMode = params.get('mode');
    if (forcedMode && forcedMode.toLowerCase() === 'battleroyale') {
        return 'battleroyale';
    }
    const pathname = window.location.pathname.toLowerCase();
    if (pathname.includes('gamebt')) {
        return 'battleroyale';
    }
    if (pathname.includes('game5v5')) {
        return 'tactical';
    }
    return 'survival';
})();
const CURRENT_QUEUE_TYPE = (() => {
    const params = new URLSearchParams(window.location.search);
    const queue = (params.get('queue') || '').toLowerCase();
    return queue === 'ranked' ? 'ranked' : 'casual';
})();
const IS_RANKED_QUEUE = CURRENT_QUEUE_TYPE === 'ranked';

// Headers padrão para requisições autenticadas
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.token}`
    };
}

// Helper para exibir mensagens de forma segura (o jogo pode não definir showMessage)
function safeShowMessage(text, duration = 2000) {
    if (typeof showMessage === 'function') {
        try { showMessage(text, duration); } catch (e) { console.log(text); }
    } else {
        console.log('MSG:', text);
    }
}

// ==========================================
// SISTEMA DE AUTENTICAÇÃO
// ==========================================

function checkAuthentication() {
    if (!API_CONFIG.token || !API_CONFIG.player) {
        console.log('Jogador não autenticado - jogando como convidado');
        return false;
    }
    return true;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('player');
    window.location.href = 'index.html';
}

// ==========================================
// PERFIL DO JOGADOR
// ==========================================

async function loadPlayerProfile() {
    if (!checkAuthentication()) return null;

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/profile`, {
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const profile = await response.json();
            console.log('Perfil carregado:', profile);
            return profile;
        } else if (response.status === 403) {
            logout(); // Token inválido
        }
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
    }
    return null;
}

// Exibir informações do perfil no HUD
async function displayPlayerInfo() {
    const profile = await loadPlayerProfile();
    if (!profile) return;

    // Adicionar ao HUD existente
    const hudElement = document.getElementById('hud');
    const playerInfo = document.createElement('div');
    playerInfo.id = 'playerInfo';
    playerInfo.style.cssText = 'position:absolute;top:30px;right:30px;text-align:right;';
    playerInfo.innerHTML = `
        <div style="font-size:20px;color:#00ff00;">${profile.display_name || profile.username}</div>
        <div style="font-size:16px;color:#ffff00;">Nível ${profile.level}</div>
        <div style="font-size:14px;color:#aaa;">XP: ${profile.experience}</div>
        <div style="font-size:14px;color:#aaa;">Recorde: Round ${profile.highest_round}</div>
    `;
    hudElement.appendChild(playerInfo);
}

// ==========================================
// SISTEMA DE SESSÃO DE JOGO
// ==========================================

let currentSessionId = null;
let sessionStartTime = Date.now();
let sessionStats = {
    kills: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    roundsCompleted: 0,
    weaponStats: {}
};

async function startGameSession(mapName = 'Default') {
    if (!checkAuthentication()) {
        clientLogs.warn('SESSION', 'Tentativa de iniciar sessão sem autenticação');
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/session/start`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ mapName })
        });

        if (response.ok) {
            const session = await response.json();
            currentSessionId = session.id;
            sessionStartTime = Date.now();
            console.log('Sessão iniciada:', session);
            clientLogs.info('SESSION', 'Sessão iniciada', { sessionId: session.id, mapName });
        }
    } catch (error) {
        console.error('Erro ao iniciar sessão:', error);
        clientLogs.error('SESSION', 'Erro ao iniciar sessão', { error: error.message, mapName });
    }
}

async function endGameSession(finalRound, totalScore) {
    if (!checkAuthentication()) {
        clientLogs.warn('SESSION', 'Tentativa de finalizar sessão sem autenticação');
        return;
    }
    if (!currentSessionId) {
        clientLogs.warn('SESSION', 'Tentativa de finalizar sessão sem ID ativo');
        return;
    }

    const playtimeSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/session/end/${currentSessionId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                roundsCompleted: sessionStats.roundsCompleted,
                finalRound: finalRound,
                totalKills: sessionStats.kills,
                totalScore: totalScore
            })
        });

        if (response.ok) {
            console.log('Sessão finalizada');
            clientLogs.info('SESSION', 'Sessão finalizada', { sessionId: currentSessionId, finalRound, totalScore, playtimeSeconds });
        }
    } catch (error) {
        console.error('Erro ao finalizar sessão:', error);
        clientLogs.error('SESSION', 'Erro ao finalizar sessão', { sessionId: currentSessionId, error: error.message });
    }
}

// ==========================================
// SISTEMA DE PONTUAÇÃO E XP
// ==========================================

async function saveHighScore(roundReached, score, kills) {
    if (!checkAuthentication()) {
        clientLogs.warn('STATS', 'Tentativa de salvar pontuação sem autenticação');
        return;
    }

    const playtimeSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
    const accuracy = sessionStats.shots > 0
        ? ((sessionStats.hits / sessionStats.shots) * 100).toFixed(2)
        : 0;

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/scores`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                score: score,
                roundReached: roundReached,
                kills: kills,
                accuracy: parseFloat(accuracy),
                playtimeSeconds: playtimeSeconds,
                mapName: customMapData?.name || 'Default'
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Pontuação salva! Novo nível:', data.newLevel);
            clientLogs.info('STATS', 'Pontuação salva', {
                roundReached,
                score,
                kills,
                mapName: customMapData?.name || 'Default'
            });

            // Mostrar mensagem de level up se subiu de nível
            const profile = await loadPlayerProfile();
            if (profile && data.newLevel > profile.level) {
                safeShowMessage(`LEVEL UP! Agora você é nível ${data.newLevel}!`, 3000);
            }

            return data;
        }
    } catch (error) {
        console.error('Erro ao salvar pontuação:', error);
        clientLogs.error('STATS', 'Erro ao salvar pontuação', { error: error.message, roundReached, score });
    }
}

// Integração segura com funções do jogo (gameOver, shoot, nextRound, showDamageNumber, checkDeadEnemies)
// Nem sempre este script é carregado depois do código do jogo; fazemos tentativas até as funções existirem.
function attemptIntegrations(retries = 0) {
    try {
        // gameOver
        if (typeof gameOver === 'function' && gameOver._integratedWithAPI !== true) {
            const original = gameOver;
            gameOver = async function () {
                const playerWon = arguments && arguments.length > 0 ? !!arguments[0] : false;
                if (checkAuthentication()) {
                    try {
                        await saveHighScore(currentRound, calculateScore(), sessionStats.kills);
                        await endGameSession(currentRound, calculateScore());
                        await saveWeaponStats();
                        // Tactical-specific endpoint
                        if (CURRENT_GAME_MODE === 'tactical') {
                            if (IS_RANKED_QUEUE) {
                                try {
                                    await fetch(`${API_CONFIG.baseUrl}/stats/tactical`, {
                                        method: 'POST',
                                        headers: getAuthHeaders(),
                                        body: JSON.stringify({
                                            won: playerWon,
                                            roundsWon: currentRound || 0,
                                            kills: sessionStats.kills || 0,
                                            rank: playerWon ? 1 : 5,
                                            queue: CURRENT_QUEUE_TYPE,
                                            ranked: true
                                        })
                                    });
                                } catch (e) { console.warn('Erro ao enviar stats táticos:', e); }
                            } else {
                                console.log('Partida tática casual: stats ranqueados não enviados.');
                            }
                        }
                    } catch (e) {
                        console.warn('Erro ao salvar stats durante gameOver:', e);
                    }
                }
                return original.apply(this, arguments);
            };
            gameOver._integratedWithAPI = true;
        }

        // shoot
        if (typeof shoot === 'function' && shoot._integratedWithAPI !== true) {
            const original = shoot;
            shoot = function () {
                const weaponName = (typeof playerConfig !== 'undefined' && playerConfig.currentWeapon) ? playerConfig.currentWeapon : 'pistol';
                try { trackShot(weaponName); } catch (e) { /* ignore */ }
                return original.apply(this, arguments);
            };
            shoot._integratedWithAPI = true;
        }

        // showDamageNumber
        if (typeof showDamageNumber === 'function' && showDamageNumber._integratedWithAPI !== true) {
            const original = showDamageNumber;
            showDamageNumber = function (damage, position, isHeadshot) {
                const weaponName = (typeof playerConfig !== 'undefined' && playerConfig.currentWeapon) ? playerConfig.currentWeapon : 'pistol';
                try { trackHit(weaponName, isHeadshot); } catch (e) { /* ignore */ }
                return original.apply(this, arguments);
            };
            showDamageNumber._integratedWithAPI = true;
        }

        // nextRound
        if (typeof nextRound === 'function' && nextRound._integratedWithAPI !== true) {
            const original = nextRound;
            nextRound = async function () {
                try {
                    sessionStats.roundsCompleted++;
                    if (sessionStats.roundsCompleted % 5 === 0 && checkAuthentication()) {
                        await saveHighScore(currentRound, calculateScore(), sessionStats.kills);
                        await saveWeaponStats();
                        const profile = await loadPlayerProfile();
                        if (profile) await checkAndUnlockAchievements(profile);
                    }
                } catch (e) {
                    console.warn('Erro na integração de nextRound:', e);
                }
                return original.apply(this, arguments);
            };
            nextRound._integratedWithAPI = true;
        }

        // checkDeadEnemies
        if (typeof checkDeadEnemies === 'function' && checkDeadEnemies._integratedWithAPI !== true) {
            const original = checkDeadEnemies;
            checkDeadEnemies = function () {
                const enemiesBefore = (typeof enemies !== 'undefined') ? enemies.length : 0;
                const result = original.apply(this, arguments);
                try {
                    const enemiesAfter = (typeof enemies !== 'undefined') ? enemies.length : 0;
                    if (enemiesBefore > enemiesAfter) {
                        const kills = enemiesBefore - enemiesAfter;
                        for (let i = 0; i < kills; i++) trackWeaponKill((typeof playerConfig !== 'undefined' && playerConfig.currentWeapon) ? playerConfig.currentWeapon : 'pistol', false);
                    }
                } catch (e) { /* ignore */ }
                return result;
            };
            checkDeadEnemies._integratedWithAPI = true;
        }

        // setupStartButton: garantir que o clique inicie a sessão da API
        if (typeof setupStartButton === 'function' && setupStartButton._integratedWithAPI !== true) {
            const original = setupStartButton;
            setupStartButton = function () {
                original.apply(this, arguments);
                const startBtn = document.getElementById('startButton');
                if (startBtn) {
                    const originalClick = startBtn.onclick;
                    startBtn.onclick = async function (evt) {
                        try { await startGameSession(customMapData?.name || 'Default'); } catch (e) { console.warn('Erro ao iniciar sessão via API:', e); }
                        if (typeof originalClick === 'function') originalClick.call(this, evt);
                    };
                }
            };
            setupStartButton._integratedWithAPI = true;
        }

        return true;
    } catch (err) {
        if (retries < 10) {
            setTimeout(() => attemptIntegrations(retries + 1), 500);
        }
        return false;
    }
}

// ==========================================
// RASTREAMENTO DE ESTATÍSTICAS
// ==========================================

function trackKill(isHeadshot = false) {
    sessionStats.kills++;
    if (isHeadshot) sessionStats.headshots++;
}

function trackShot(weaponName) {
    sessionStats.shots++;

    if (!sessionStats.weaponStats[weaponName]) {
        sessionStats.weaponStats[weaponName] = {
            shots: 0,
            hits: 0,
            kills: 0,
            headshots: 0
        };
    }
    sessionStats.weaponStats[weaponName].shots++;
}

function trackHit(weaponName, isHeadshot = false) {
    sessionStats.hits++;

    if (sessionStats.weaponStats[weaponName]) {
        sessionStats.weaponStats[weaponName].hits++;
        if (isHeadshot) {
            sessionStats.weaponStats[weaponName].headshots++;
        }
    }
}

function trackWeaponKill(weaponName, isHeadshot = false) {
    if (sessionStats.weaponStats[weaponName]) {
        sessionStats.weaponStats[weaponName].kills++;
    }
    trackKill(isHeadshot);
}

// A integração com a função `shoot` é feita de forma segura em `attemptIntegrations()`

// A integração com `showDamageNumber` é feita de forma segura em `attemptIntegrations()`

// ==========================================
// ESTATÍSTICAS DE ARMAS
// ==========================================

async function saveWeaponStats() {
    if (!checkAuthentication()) {
        clientLogs.warn('WEAPONS', 'Tentativa de salvar stats sem autenticação');
        return;
    }

    for (const [weaponName, stats] of Object.entries(sessionStats.weaponStats)) {
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}/weapons/stats`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    weaponName: weaponName,
                    shots: stats.shots,
                    hits: stats.hits,
                    kills: stats.kills,
                    headshots: stats.headshots,
                    gameMode: CURRENT_GAME_MODE
                })
            });

            if (response.ok) {
                clientLogs.info('WEAPONS', 'Stats de arma enviados', { weaponName, ...stats, gameMode: CURRENT_GAME_MODE });
            } else {
                clientLogs.warn('WEAPONS', 'Falha ao enviar stats de arma', { weaponName, status: response.status });
            }
        } catch (error) {
            console.error('Erro ao salvar stats de arma:', error);
            clientLogs.error('WEAPONS', 'Erro ao salvar stats de arma', { weaponName, error: error.message });
        }
    }
}

// ==========================================
// CONQUISTAS
// ==========================================

// ==========================================
// CONQUISTAS
// ==========================================

async function checkAndUnlockAchievements(profile) {
    if (!checkAuthentication()) return;

    const achievements = [
        { id: 1, type: 'kills', value: 1 },
        { id: 2, type: 'kills', value: 100 },
        { id: 3, type: 'kills', value: 1000 },
        { id: 4, type: 'rounds', value: 5 },
        { id: 5, type: 'rounds', value: 10 },
        { id: 6, type: 'rounds', value: 20 },
        { id: 7, type: 'headshots', value: 50 },
        { id: 8, type: 'headshots', value: 200 },
        { id: 9, type: 'level', value: 5 },
        { id: 10, type: 'level', value: 10 },
        { id: 11, type: 'level', value: 25 },
        { id: 12, type: 'level', value: 50 }
    ];

    for (const achievement of achievements) {
        let shouldUnlock = false;

        switch (achievement.type) {
            case 'kills':
                shouldUnlock = profile.total_kills >= achievement.value;
                break;
            case 'rounds':
                shouldUnlock = profile.highest_round >= achievement.value;
                break;
            case 'headshots':
                shouldUnlock = sessionStats.headshots >= achievement.value;
                break;
            case 'level':
                shouldUnlock = profile.level >= achievement.value;
                break;
        }

        if (shouldUnlock) {
            await unlockAchievement(achievement.id);
        }
    }
}

async function unlockAchievement(achievementId) {
    if (!checkAuthentication()) {
        clientLogs.warn('ACHIEVEMENTS', 'Tentativa de desbloquear conquista sem autenticação', { achievementId });
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/achievements/unlock/${achievementId}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const data = await response.json();
            if (data.achievement) {
                safeShowMessage('🏆 Conquista Desbloqueada!', 3000);
                clientLogs.info('ACHIEVEMENTS', 'Conquista desbloqueada', { achievementId });
            }
        } else {
            clientLogs.warn('ACHIEVEMENTS', 'Falha ao desbloquear conquista', { achievementId, status: response.status });
        }
    } catch (error) {
        console.error('Erro ao desbloquear conquista:', error);
        clientLogs.error('ACHIEVEMENTS', 'Erro ao desbloquear conquista', { achievementId, error: error.message });
    }
}

// ==========================================
// LEADERBOARD / MATCH FEED (Launcher + Jogos)
// ==========================================

const VALID_UI_MODES = ['survival', 'battleroyale', 'tactical'];
const LEGACY_LEADERBOARD_ROUTES = {
    survival: {
        default: '/leaderboard',
        mmr: '/leaderboard',
        wins: '/leaderboard/rounds',
        kills: '/leaderboard/kills',
        score: '/leaderboard'
    },
    battleroyale: {
        default: '/leaderboard/br-wins',
        mmr: '/leaderboard/br-wins',
        wins: '/leaderboard/br-wins',
        kills: '/leaderboard/br-kills',
        winrate: '/leaderboard/br-wins'
    },
    tactical: {
        default: '/leaderboard/tactical-wins',
        mmr: '/leaderboard/tactical-wins',
        wins: '/leaderboard/tactical-wins',
        kills: '/leaderboard/tactical-wins',
        winrate: '/leaderboard/tactical-wins'
    }
};

function normalizeClientMode(mode = 'survival') {
    const normalized = (mode || 'survival').toString().toLowerCase();
    return VALID_UI_MODES.includes(normalized) ? normalized : 'survival';
}

async function fetchModeLeaderboard({ mode = 'survival', metric = 'mmr', limit = 100 } = {}) {
    const normalizedMode = normalizeClientMode(mode);
    const safeMetric = (metric || 'mmr').toString().toLowerCase();
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
    const query = new URLSearchParams({
        mode: normalizedMode,
        metric: safeMetric,
        limit: safeLimit
    });

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/leaderboard/modes?${query.toString()}`);
        if (!response.ok) {
            throw new Error('Falha ao carregar leaderboard por modo');
        }
        const payload = await response.json();
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.rows)) return payload.rows;
        if (Array.isArray(payload?.leaderboard)) return payload.leaderboard;
        if (Array.isArray(payload?.data)) return payload.data;
        return [];
    } catch (error) {
        console.warn('Leaderboard v2 indisponível, tentando rotas legadas.', error);
        return fetchLegacyLeaderboardData({ mode: normalizedMode, metric: safeMetric, limit: safeLimit });
    }
}

async function fetchLegacyLeaderboardData({ mode, metric, limit }) {
    const routeConfig = LEGACY_LEADERBOARD_ROUTES[mode];
    if (!routeConfig) {
        throw new Error('Modo não suportado para fallback de leaderboard');
    }
    const endpoint = routeConfig[metric] || routeConfig.default;
    if (!endpoint) {
        throw new Error('Nenhuma rota legada mapeada para este modo');
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}${separator}limit=${limit}`);
    if (!response.ok) {
        throw new Error('Falha ao carregar leaderboard legado');
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) {
        return [];
    }
    return rows.map(row => mapLegacyLeaderboardEntry(row, mode));
}

function mapLegacyLeaderboardEntry(row, mode) {
    const base = {
        rank: row.rank,
        username: row.username,
        display_name: row.display_name,
        level: row.level || 1
    };

    if (mode === 'survival') {
        base.best_score = row.best_score ?? row.score ?? 0;
        base.mmr_rating = base.best_score;
        base.wins = row.highest_round ?? row.score ?? 0;
        base.total_kills = row.total_kills ?? 0;
    } else if (mode === 'battleroyale') {
        base.mmr_rating = row.score ?? row.br_wins ?? 0;
        base.wins = row.score ?? row.br_wins ?? 0;
        base.br_total_kills = row.br_total_kills ?? 0;
    } else if (mode === 'tactical') {
        base.mmr_rating = row.score ?? 0;
        base.wins = row.score ?? 0;
    }

    return base;
}

async function fetchModeMatches({ mode = 'survival', limit = 6, playerId } = {}) {
    const normalizedMode = normalizeClientMode(mode);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 100);
    const query = new URLSearchParams({ mode: normalizedMode, limit: safeLimit });
    if (playerId) {
        query.append('playerId', playerId);
    }

    const response = await fetch(`${API_CONFIG.baseUrl}/matches?${query.toString()}`);
    if (!response.ok) {
        throw new Error('Falha ao carregar partidas por modo');
    }
    return response.json();
}

async function loadLeaderboard(limit = 10) {
    try {
        return await fetchModeLeaderboard({ limit, mode: 'survival', metric: 'mmr' });
    } catch (error) {
        console.error('Erro ao carregar leaderboard:', error);
        return [];
    }
}

function displayLeaderboard(leaderboard) {
    // Criar ou atualizar elemento de leaderboard no menu
    let leaderboardDiv = document.getElementById('leaderboardDisplay');

    if (!leaderboardDiv) {
        leaderboardDiv = document.createElement('div');
        leaderboardDiv.id = 'leaderboardDisplay';
        leaderboardDiv.style.cssText = `
            position: absolute;
            top: 50%;
            right: 30px;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #00ff00;
            border-radius: 10px;
            padding: 20px;
            min-width: 300px;
            display: none;
        `;
        document.body.appendChild(leaderboardDiv);
    }

    let html = '<h2 style="color:#00ff00;text-align:center;margin-bottom:15px;">🏆 TOP 10</h2>';
    html += '<table style="width:100%;color:white;font-size:14px;">';

    leaderboard.slice(0, 10).forEach((player, index) => {
        const rankColor = index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#fff';
        html += `
            <tr style="border-bottom:1px solid #333;">
                <td style="color:${rankColor};font-weight:bold;padding:8px;">#${index + 1}</td>
                <td style="padding:8px;">${player.display_name || player.username}</td>
                <td style="padding:8px;text-align:right;color:#00ff00;">${player.best_score || 0}</td>
            </tr>
        `;
    });

    html += '</table>';
    leaderboardDiv.innerHTML = html;
}

// Adicionar botão de leaderboard ao menu principal
function addLeaderboardButton() {
    const menuMain = document.getElementById('menuMain');
    if (menuMain) {
        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.textContent = 'LEADERBOARD';
        btn.onclick = async () => {
            const leaderboard = await loadLeaderboard();
            displayLeaderboard(leaderboard);
            const leaderboardDiv = document.getElementById('leaderboardDisplay');
            leaderboardDiv.style.display = leaderboardDiv.style.display === 'none' ? 'block' : 'none';
        };
        menuMain.insertBefore(btn, menuMain.children[1]);
    }
}

// ==========================================
// CÁLCULO DE PONTUAÇÃO
// ==========================================

function calculateScore() {
    let score = 0;

    // Pontos por kills
    score += sessionStats.kills * 100;

    // Bônus por headshots
    score += sessionStats.headshots * 50;

    // Pontos por rounds completados
    score += sessionStats.roundsCompleted * 500;

    // Bônus de precisão
    if (sessionStats.shots > 0) {
        const accuracy = (sessionStats.hits / sessionStats.shots) * 100;
        if (accuracy > 50) score += 1000;
        if (accuracy > 75) score += 2000;
    }

    return score;
}

// ==========================================
// INTEGRAÇÃO COM ROUNDS
// ==========================================

// Modificar a função nextRound existente (apenas se existir - só existe em game.js)
if (typeof nextRound === 'function') {
    const originalNextRound = nextRound;
    nextRound = async function () {
        sessionStats.roundsCompleted++;

        // Salvar progresso a cada 5 rounds
        if (sessionStats.roundsCompleted % 5 === 0 && checkAuthentication()) {
            await saveHighScore(currentRound, calculateScore(), sessionStats.kills);
            await saveWeaponStats();

            const profile = await loadPlayerProfile();
            if (profile) {
                await checkAndUnlockAchievements(profile);
            }
        }

        originalNextRound();
    };
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function initializeGame() {
    // Verificar autenticação
    if (checkAuthentication()) {
        console.log('✅ Jogador autenticado:', API_CONFIG.player.username);

        // Carregar perfil
        await displayPlayerInfo();

        // A integração do botão de início com a API será feita de forma segura
        // por `attemptIntegrations()` que tenta integrar quando as funções do jogo existirem.

        // Adicionar botão de leaderboard
        addLeaderboardButton();

        // Adicionar botão de logout ao menu
        const menuMain = document.getElementById('menuMain');
        if (menuMain) {
            const logoutBtn = document.createElement('button');
            logoutBtn.className = 'danger';
            logoutBtn.textContent = 'LOGOUT';
            logoutBtn.onclick = logout;
            menuMain.appendChild(logoutBtn);
        }
    } else {
        console.log('ℹ️ Jogando como convidado');
    }
}

// ==========================================
// ESTATÍSTICAS EM TEMPO REAL
// ==========================================

// Tentar integrar com as funções do jogo (pode ser carregado antes do código do jogo)
attemptIntegrations();

function updateSessionStats() {
    // Atualizar display de estatísticas durante o jogo
    let statsDiv = document.getElementById('sessionStats');

    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'sessionStats';
        statsDiv.style.cssText = `
            position: absolute;
            top: 150px;
            left: 30px;
            color: white;
            font-size: 14px;
            text-shadow: 2px 2px 4px #000;
            pointer-events: none;
        `;
        document.getElementById('hud').appendChild(statsDiv);
    }

    const accuracy = sessionStats.shots > 0
        ? ((sessionStats.hits / sessionStats.shots) * 100).toFixed(1)
        : 0;

    statsDiv.innerHTML = `
        <div>Kills: ${sessionStats.kills}</div>
        <div>Headshots: ${sessionStats.headshots}</div>
        <div>Precisão: ${accuracy}%</div>
        <div>Score: ${calculateScore()}</div>
    `;
}

// Atualizar stats a cada segundo
setInterval(() => {
    if (gameStarted && pointerLocked) {
        updateSessionStats();
    }
}, 1000);

// ==========================================
// CALLBACK DE MORTE DE INIMIGO
// ==========================================

// Integrar com checkDeadEnemies
const originalCheckDeadEnemies = checkDeadEnemies;
checkDeadEnemies = function () {
    const enemiesBeforeDeath = enemies.length;
    originalCheckDeadEnemies();
    const enemiesAfterDeath = enemies.length;

    // Se inimigos morreram, registrar kill
    if (enemiesBeforeDeath > enemiesAfterDeath) {
        const kills = enemiesBeforeDeath - enemiesAfterDeath;
        for (let i = 0; i < kills; i++) {
            // Verificar se foi headshot (simplificado)
            trackWeaponKill(playerConfig.currentWeapon, false);
        }
    }
};

// ==========================================
// SALVAR DADOS PERIODICAMENTE
// ==========================================

// Auto-save a cada 2 minutos
setInterval(async () => {
    if (gameStarted && checkAuthentication()) {
        await saveWeaponStats();
        console.log('✅ Stats salvas automaticamente');
    }
}, 120000);

// Salvar ao fechar a página
window.addEventListener('beforeunload', async (e) => {
    if (gameStarted && checkAuthentication()) {
        await saveHighScore(currentRound, calculateScore(), sessionStats.kills);
        await endGameSession(currentRound, calculateScore());
        await saveWeaponStats();
    }
});

// ==========================================
// EXECUTAR INICIALIZAÇÃO
// ==========================================

// Chamar quando o documento estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}

// ==========================================
// INSTRUÇÕES DE USO
// ==========================================

/*
COMO INTEGRAR ESTE CÓDIGO NO SEU JOGO:

1. Adicione este script ANTES do fechamento da tag </body> no game.html
2. Certifique-se que o jogo tem as seguintes funções:
   - gameOver()
   - nextRound()
   - shoot()
   - showDamageNumber()
   - checkDeadEnemies()

3. As seguintes variáveis devem existir:
   - gameStarted
   - pointerLocked
   - currentRound
   - playerConfig
   - enemies
   - customMapData (opcional)

4. Os elementos HTML necessários:
   - #hud (container principal do HUD)
   - #menuMain (menu principal)
   - #startButton (botão de iniciar)

5. O código irá automaticamente:
   - Salvar pontuações
   - Rastrear estatísticas
   - Desbloquear conquistas
   - Calcular XP e níveis
   - Exibir leaderboard

6. Para testar:
   - Faça login em index.html
   - Inicie o jogo
   - Jogue normalmente
   - Suas estatísticas serão salvas automaticamente

OBSERVAÇÕES:
- O código funciona tanto com quanto sem autenticação
- Sem autenticação, o jogo funciona normalmente mas não salva dados
- Com autenticação, todas as estatísticas são salvas no banco
- As conquistas são verificadas automaticamente
- O leaderboard pode ser acessado pelo menu
*/

console.log('🎮 Sistema de estatísticas carregado!');

// ==========================================
// SISTEMA DE RANKING
// ==========================================

function calculateRank(profile, mode = 'survival') {
    const ranks = [
        { name: 'Bronze I', minScore: 0, color: '#cd7f32' },
        { name: 'Bronze II', minScore: 3000, color: '#cd7f32' },
        { name: 'Bronze III', minScore: 6000, color: '#cd7f32' },
        { name: 'Prata I', minScore: 10000, color: '#c0c0c0' },
        { name: 'Prata II', minScore: 15000, color: '#c0c0c0' },
        { name: 'Prata III', minScore: 20000, color: '#c0c0c0' },
        { name: 'Ouro I', minScore: 28000, color: '#ffd700' },
        { name: 'Ouro II', minScore: 35000, color: '#ffd700' },
        { name: 'Ouro III', minScore: 42000, color: '#ffd700' },
        { name: 'Platina I', minScore: 60000, color: '#e5e4e2' },
        { name: 'Platina II', minScore: 75000, color: '#e5e4e2' },
        { name: 'Platina III', minScore: 90000, color: '#e5e4e2' },
        { name: 'Diamante I', minScore: 120000, color: '#b9f2ff' }
    ];

    let score = 0;

    if (mode === 'survival') {
        // Score baseado em Nível, Rounds e Precisão (estimada)
        // Assumindo precisão média de 30% se não tiver dados
        const accuracy = 30;
        score = (profile.level * 200) + (profile.highest_round * 100) + (profile.total_kills * 0.5);
    } else {
        // Battle Royale: Vitórias e Kills
        score = ((profile.br_wins || 0) * 1000) + ((profile.br_total_kills || 0) * 10) + ((profile.br_games_played || 0) * 5);
    }

    let currentRank = ranks[0];
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (score >= ranks[i].minScore) {
            currentRank = ranks[i];
            break;
        }
    }

    return currentRank;
}

// ==========================================
// BATTLE ROYALE STATS
// ==========================================

async function saveBattleRoyaleStats(won, position, kills) {
    const authenticated = checkAuthentication();
    if (!authenticated || !IS_RANKED_QUEUE) {
        persistLocalBattleRoyaleStats(won, position, kills);
        if (authenticated && !IS_RANKED_QUEUE) {
            safeShowMessage('Partida casual concluída. Elo permanece inalterado.', 2500);
            clientLogs.info('BATTLE_ROYALE', 'Match casual registrado localmente', { position, kills });
        } else if (!authenticated) {
            clientLogs.warn('BATTLE_ROYALE', 'Stats BR apenas locais por falta de login', { position, kills });
        }
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/stats/br`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ won, position, kills, queue: CURRENT_QUEUE_TYPE, ranked: true })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Stats BR ranqueadas salvas:', data);
            clientLogs.info('BATTLE_ROYALE', 'Stats ranqueadas enviadas', { won, position, kills, queue: CURRENT_QUEUE_TYPE });

            const profile = await loadPlayerProfile();
            if (profile && data.newLevel > profile.level) {
                safeShowMessage(`LEVEL UP! Agora você é nível ${data.newLevel}!`, 3000);
            }
        }
    } catch (error) {
        console.error('Erro ao salvar stats BR:', error);
        clientLogs.error('BATTLE_ROYALE', 'Erro ao salvar stats BR', { error: error.message, position, kills });
    }
}

function persistLocalBattleRoyaleStats(won, position, kills) {
    const stats = JSON.parse(localStorage.getItem('battleRoyaleStats') || '{}');
    if (!stats.gamesPlayed) {
        stats.gamesPlayed = 0;
        stats.wins = 0;
        stats.totalKills = 0;
        stats.bestPosition = 10;
    }
    stats.gamesPlayed += 1;
    if (won) stats.wins += 1;
    stats.totalKills += kills;
    if (position < stats.bestPosition) stats.bestPosition = position;
    localStorage.setItem('battleRoyaleStats', JSON.stringify(stats));
    clientLogs.info('BATTLE_ROYALE', 'Stats BR armazenadas localmente', { won, position, kills, stats });
}

// ==========================================
// CUSTOMIZAÇÃO (SKINS)
// ==========================================

async function updateSkin(skinBody, skinHead, skinTexture = null) {
    if (!checkAuthentication()) {
        clientLogs.warn('PROFILE', 'Tentativa de atualizar skin sem autenticação');
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/profile`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ skinBody, skinHead, skinTexture })
        });

        const rawPayload = await response.text();
        let data = null;
        if (rawPayload) {
            try {
                data = JSON.parse(rawPayload);
            } catch (parseError) {
                console.warn('Resposta inesperada ao atualizar skin', parseError);
            }
        }

        if (response.ok) {
            console.log('Skin atualizada:', data);
            safeShowMessage('Visual atualizado com sucesso!', 2000);
            clientLogs.info('PROFILE', 'Skin atualizada', { skinBody, skinHead, hasTexture: !!skinTexture });
            return data;
        }

        const errorMessage = data?.error || data?.message || `Falha ao salvar visual (HTTP ${response.status})`;
        safeShowMessage(errorMessage, 2500);
        clientLogs.warn('PROFILE', 'Falha ao atualizar skin', {
            skinBody,
            skinHead,
            hasTexture: !!skinTexture,
            status: response.status
        });
        return null;
    } catch (error) {
        console.error('Erro ao atualizar skin:', error);
        safeShowMessage('Erro ao salvar visual', 2000);
        clientLogs.error('PROFILE', 'Erro ao atualizar skin', { error: error.message });
    }
}

async function updateDisplayName(newName) {
    if (!checkAuthentication()) {
        clientLogs.warn('PROFILE', 'Tentativa de alterar nome sem autenticação');
        return;
    }

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/profile`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ displayName: newName })
        });

        if (response.ok) {
            const data = await response.json();
            safeShowMessage('Nome atualizado!', 2000);
            clientLogs.info('PROFILE', 'Nome de exibição atualizado', { newName });
            return data;
        }
    } catch (error) {
        console.error('Erro ao atualizar nome:', error);
        clientLogs.error('PROFILE', 'Erro ao atualizar nome', { error: error.message });
    }
}

// Inicializar integrações
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attemptIntegrations);
} else {
    attemptIntegrations();
}
