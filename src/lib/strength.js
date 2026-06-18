// ============================================================================
// TEAM STRENGTH + PLAYER QUALITY
// ----------------------------------------------------------------------------
// Two real-world signals that make the lines (and therefore the payouts) fair:
//
//   1. TEAM STRENGTH  — from approximate current FIFA ranking points. A strong
//      side is more likely to score and win, so its attackers' baselines go UP
//      (their goal is "expected" → pays less) and a weak side's go DOWN (their
//      goal is a longshot → pays more). Keeper "conceded" works the other way.
//
//   2. PLAYER QUALITY — elite/star players score more often than a squad player,
//      so their attacking baselines get a multiplier (Messi over 0.5 is likelier
//      → pays less than a no-name doing the same).
//
// Both feed the baseline in lineEngine, and the scoring engine prices the payout
// as 1/probability — so longshots (weak team, low-quality player) pay the most.
// Shared by frontend + Cloud Functions; dependency-light (imports popular.js).
// ============================================================================

import { matchesAny, isStar, normalizeName } from './popular.js';

// Approx FIFA ranking points (mid-2025/26). Covers the WC 2026 field plus a few
// extras used by the mock/demo. Relative order is what matters, not precision.
const RATING = {
  argentina: 1885, france: 1862, spain: 1855, england: 1820, brazil: 1778,
  portugal: 1775, netherlands: 1756, belgium: 1736, italy: 1718, croatia: 1716,
  morocco: 1700, colombia: 1690, uruguay: 1680, germany: 1666, mexico: 1655,
  japan: 1652, switzerland: 1648, senegal: 1645, usa: 1641, iran: 1638,
  denmark: 1640, austria: 1602, ecuador: 1571, 'south korea': 1575, sweden: 1580,
  turkiye: 1560, norway: 1535, canada: 1531, 'ivory coast': 1530, ukraine: 1530,
  australia: 1500, egypt: 1518, algeria: 1507, scotland: 1500, tunisia: 1500,
  nigeria: 1500, 'bosnia herzegovina': 1490, paraguay: 1480, ghana: 1470,
  'congo dr': 1455, 'south africa': 1445, qatar: 1438, uzbekistan: 1437,
  'saudi arabia': 1420, iraq: 1400, panama: 1395, 'cape verde islands': 1390,
  curacao: 1372, jordan: 1316, haiti: 1300, 'new zealand': 1245,
};

// Naming differences between feeds → our table keys.
const ALIASES = {
  'united states': 'usa', 'korea republic': 'south korea',
  'czechia': 'czech republic', 'cote d ivoire': 'ivory coast', 'turkey': 'turkiye',
  'cape verde': 'cape verde islands', 'bosnia and herzegovina': 'bosnia herzegovina',
  'dr congo': 'congo dr', 'democratic republic of congo': 'congo dr',
};

// Czech Republic isn't in RATING above (kept the long key off the table for
// brevity); add it via alias-to-self handling below.
RATING['czech republic'] = 1500;

const DEFAULT_RATING = 1450; // unknown nation → mid-table
const R_MIN = 1250, R_MAX = 1900;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function teamRating(name) {
  const n = normalizeName(name);
  return RATING[ALIASES[n] || n] ?? DEFAULT_RATING;
}

/** 0 (weakest) … 1 (strongest), normalised across the rating band. */
export function teamStrength(name) {
  return clamp((teamRating(name) - R_MIN) / (R_MAX - R_MIN), 0, 1);
}

/**
 * Per-side baseline multipliers for a matchup.
 * @param {string} ownName  the player's team
 * @param {string} oppName  the opponent
 */
export function matchupContext(ownName, oppName) {
  const own = teamStrength(ownName);
  const opp = teamStrength(oppName);
  const d = own - opp; // -1 (big underdog) … +1 (big favourite)
  return {
    // attacking output scales with how much stronger you are than the opponent
    attackMult: clamp(1 + d * 0.7, 0.55, 1.7),
    // a weaker team concedes more (opponent stronger → higher)
    concedeMult: clamp(1 - d * 0.9, 0.5, 1.9),
    // a weaker team's keeper faces more shots → more saves to make
    savesMult: clamp(1 - d * 0.5, 0.65, 1.55),
  };
}

// Genuine global icons — a notch above "star". Normalised keys (see popular.js).
const ELITE_KEYS = [
  'messi', 'ronaldo', 'mbappe', 'haaland', 'bellingham', 'vinicius', 'kane',
  'm salah', 'mohamed salah', 'de bruyne', 'musiala', 'wirtz', 'yamal', 'rodri',
  'foden', 'saka', 'lewandowski', 'kvaratskhelia', 'osimhen', 'son heung min',
  'neymar', 'griezmann', 'rodrygo', 'pedri', 'lautaro martinez', 'l martinez',
  'julian alvarez', 'vitinha', 'olmo', 'leao', 'bruno fernandes', 'b fernandes',
];

// Genuine ATTACKING midfielders / playmakers who score like attackers. The
// position feed only gives us "M", so a creative #10 (Güler, Saïbari) gets a
// midfield goals baseline and pays out like a defensive mid — far too generous.
// These get a strong "lift toward a forward" in lineEngine, while defensive star
// mids (Rodri, Casemiro, Rice…) keep the milder default lift.
const ATT_MID_KEYS = [
  'saibari', 'ounahi', 'arda guler', 'kokcu', 'brahim diaz', 'wirtz', 'musiala',
  'foden', 'odegaard', 'olmo', 'dani olmo', 'xavi simons', 'simons', 'reijnders',
  'maddison', 'bellingham', 'de bruyne', 'kevin de bruyne', 'bruno fernandes',
  'gundogan', 'almada', 'arrascaeta', 'james rodriguez', 'lee kang in', 'paqueta',
  'kubo', 'kamada', 'mac allister', 'sucic',
];

/** True if a player is a known attacking midfielder / goal-scoring playmaker. */
export function isAttackingMid(name) {
  return matchesAny(name, ATT_MID_KEYS);
}

/**
 * Attacking-output multiplier combining player quality AND how likely they are to
 * start/feature (no lineup data pre-match, so fame is the proxy):
 *   elite ≈ 1.8× (nailed-on starters), star / attacking mid ≈ 1.4×,
 *   squad player ≈ 0.8× (less likely to start or be a goal threat).
 */
export function playerQuality(name) {
  if (matchesAny(name, ELITE_KEYS)) return 1.8;
  if (isStar(name) || isAttackingMid(name)) return 1.4;
  return 0.8;
}

/**
 * A small, STABLE per-player wobble (~0.88–1.12) so two same-tier players don't
 * share identical lines/points. Deterministic from the name (no randomness, so
 * regeneration is repeatable) — stands in for the form/role nuance we can't
 * measure pre-tournament.
 */
export function playerVariance(name) {
  const n = normalizeName(name);
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return 0.88 + ((h % 1000) / 1000) * 0.24;
}
