// Canonical v0.3 default rules — the numbers in force when NO scoring
// version is active (activeRules() returns null and calc.js falls back to
// these same values via its ?? defaults). Served at GET /scoring/defaults
// so Admin → Scoring can display exactly what the site runs on, and clone
// it into a draft. If Charles revises v0.3, update this file AND the
// matching ?? fallbacks in calc.js.
const DEFAULTS = {
  divisions: [
    { key: 'development', label: 'Development', min: null, max: 100, color: '#A0A0A0', neutral: true },
    { key: 'copper', label: 'Copper', min: 100, max: 120, color: '#B87333' },
    { key: 'bronze', label: 'Bronze', min: 120, max: 130, color: '#CD7F32' },
    { key: 'silver', label: 'Silver', min: 130, max: 145, color: '#C0C0C0' },
    { key: 'gold', label: 'Gold', min: 145, max: null, color: '#FFD700' },
  ],
  points: { clear: 10, doubleBonus: 5, placing: [5, 4, 3, 2, 1], classMax: 20, singleRoundMax: 15, twoPhaseMax: 15 },
  bestTen: { n: 10, minField: 3, riderLimitPerClass: true },
  status: { clearRoute: 2, consecutiveRoute: 3, participationTop: 6, participationWindow: 10, stepDownPerSeason: 1 },
  awards: { minStarts: 10, tiebreakMinStarts: 5 },
  worldCup: { key: 'world_cup', label: 'World Cup', color: '#8E7CFF' },
  seasonStart: '08-01',
  seasonEnd: '07-31',
};

module.exports = { DEFAULTS };
