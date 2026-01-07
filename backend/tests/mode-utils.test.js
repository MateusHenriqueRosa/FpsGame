const {
    normalizeMode,
    getLeaderboardSort,
    calculateMmrDelta,
    toInt,
    toNullableInt,
    toFloat,
    toBool
} = require('../mode-utils');

describe('mode-utils helpers', () => {
    test('normalizeMode enforces supported list', () => {
        expect(normalizeMode('TACTICAL')).toBe('tactical');
        expect(normalizeMode('BattleRoyale')).toBe('battleroyale');
        expect(normalizeMode('unknown')).toBe('survival');
    });

    test('getLeaderboardSort falls back to mmr', () => {
        expect(getLeaderboardSort('wins')).toContain('pms.wins');
        expect(getLeaderboardSort('invalid')).toContain('pms.mmr_rating');
    });

    test('calculateMmrDelta rewards tactical wins with kill/round bonuses', () => {
        const delta = calculateMmrDelta('tactical', 'win', { kills: 9, roundsWon: 8 });
        expect(delta).toBeGreaterThan(28); // base win value
    });

    test('calculateMmrDelta penalizes BR losses but mitigates good placement', () => {
        const delta = calculateMmrDelta('battleroyale', 'loss', { kills: 3, placement: 2 });
        expect(delta).toBeGreaterThan(-15); // placement bonus softens loss
    });

    test('toInt and toNullableInt parse safely', () => {
        expect(toInt('42')).toBe(42);
        expect(toInt('bad', 7)).toBe(7);
        expect(toNullableInt('11')).toBe(11);
        expect(toNullableInt('nope')).toBeNull();
    });

    test('toFloat and toBool coerce values consistently', () => {
        expect(toFloat('3.14')).toBeCloseTo(3.14);
        expect(toFloat('invalid', 1.5)).toBe(1.5);
        expect(toBool('true')).toBe(true);
        expect(toBool('FALSE')).toBe(false);
        expect(toBool(1)).toBe(true);
    });
});
