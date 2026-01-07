'use strict';

const VALID_GAME_MODES = ['survival', 'battleroyale', 'tactical'];

const MODE_METRIC_SORTS = {
    mmr: 'pms.mmr_rating DESC, pms.wins DESC, p.username ASC',
    wins: 'pms.wins DESC, pms.mmr_rating DESC, p.username ASC',
    kills: 'pms.kills DESC, pms.mmr_rating DESC, p.username ASC',
    winrate: 'pms.win_rate DESC, pms.matches_played DESC, p.username ASC',
    score: 'pms.best_score DESC NULLS LAST, pms.mmr_rating DESC, p.username ASC'
};

const toInt = (value, fallback = 0) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toNullableInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

const toFloat = (value, fallback = 0) => {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return Boolean(value);
};

const normalizeMode = (mode = 'survival') => {
    const normalized = (mode || 'survival').toString().toLowerCase();
    return VALID_GAME_MODES.includes(normalized) ? normalized : 'survival';
};

const getLeaderboardSort = (metric = 'mmr') => {
    const key = (metric || 'mmr').toString().toLowerCase();
    return MODE_METRIC_SORTS[key] || MODE_METRIC_SORTS.mmr;
};

const calculateMmrDelta = (mode, result, performance = {}) => {
    const normalizedMode = normalizeMode(mode);
    const outcome = (result || '').toString().toLowerCase();
    const kills = toInt(performance.kills, 0);
    const roundsWon = toInt(performance.roundsWon, 0);
    const placement = toNullableInt(performance.placement);

    const config = {
        survival: { win: 18, loss: -12, killWeight: 0.5 },
        battleroyale: { win: 24, loss: -15, killWeight: 1 },
        tactical: { win: 28, loss: -20, killWeight: 0.8 }
    };

    const { win, loss, killWeight } = config[normalizedMode];
    let delta = outcome === 'win' ? win : outcome === 'loss' ? loss : 0;
    delta += Math.min(15, kills) * killWeight;

    if (normalizedMode === 'tactical') {
        delta += Math.min(5, roundsWon);
    }

    if (normalizedMode === 'battleroyale' && placement && placement <= 5) {
        delta += Math.max(0, 6 - placement);
    }

    return Math.round(delta);
};

module.exports = {
    VALID_GAME_MODES,
    MODE_METRIC_SORTS,
    normalizeMode,
    getLeaderboardSort,
    calculateMmrDelta,
    toInt,
    toNullableInt,
    toFloat,
    toBool
};
