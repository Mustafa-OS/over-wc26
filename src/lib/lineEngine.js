// ============================================================================
// LINE ENGINE
// ----------------------------------------------------------------------------
// Decides the over/under "line" for a given player + metric, PrizePicks-style.
// No odds feed required — lines are derived from position + a per-player form
// baseline (season/tournament average if available, else a position default).
//
// This file is the single source of truth for lines. It is imported BOTH by
// the frontend (to display props) and by the Cloud Functions (to generate the
// canonical prop set written to Firestore). Keep it dependency-free so it runs
// in Node and in the browser unchanged.
// ============================================================================

import { matchupContext, playerQuality, playerVariance, isAttackingMid } from './strength.js';

// Metrics we support. `key` must match the field we read back from the stats
// feed when resolving (see functions/apiFootball.js -> normalisePlayerStats).
export const METRICS = {
  goals:        { key: 'goals',        label: 'Goals',          short: 'GLS' },
  assists:      { key: 'assists',      label: 'Assists',        short: 'AST' },
  shots:        { key: 'shots',        label: 'Shots',          short: 'SH'  },
  shotsOn:      { key: 'shotsOn',      label: 'Shots on Target',short: 'SOT' },
  saves:        { key: 'saves',        label: 'Saves',          short: 'SV'  },
  conceded:     { key: 'conceded',     label: 'Goals Conceded', short: 'GC'  },
  tackles:      { key: 'tackles',      label: 'Tackles',        short: 'TKL' },
  passes:       { key: 'passes',       label: 'Passes',         short: 'PAS' },
  fouls:        { key: 'fouls',        label: 'Fouls Committed',short: 'FLS' },
  cards:        { key: 'cards',        label: 'Cards',          short: 'CRD' },
};

// Which metrics make sense for which position, in headline-first order (the
// first entry is the default a player's card opens on). Keepers get saves +
// goals conceded — never a goals line (a keeper scoring is a ~1% novelty, which
// made one side a pointless near-lock).
const POSITION_METRICS = {
  G: ['saves', 'conceded'],
  D: ['tackles', 'shots', 'passes', 'goals'],
  M: ['shots', 'shotsOn', 'assists', 'tackles', 'passes', 'goals'],
  F: ['goals', 'shotsOn', 'shots', 'assists'],
};

// Position default baselines = expected count for an average starter in 90 mins,
// used when we have no per-player history. Tuned to WC level so the half-line
// sits near the median and both sides of a prop are live (not a near-certainty).
// Sanity: line = round(baseline) area; MORE ≈ P(X ≥ ceil(line)) lands ~25–55%.
const POSITION_BASELINE = {
  G: { saves: 2.8, conceded: 1.15 },
  D: { tackles: 2.1, shots: 0.5, passes: 50, goals: 0.04 },
  M: { shots: 1.2, shotsOn: 0.5, assists: 0.18, tackles: 1.7, passes: 55, goals: 0.10 },
  F: { goals: 0.32, shotsOn: 1.2, shots: 2.6, assists: 0.18 },
};

// Round a raw baseline to a clean half-line (0.5, 1.5, 2.5 ...). Half-lines
// remove the "exactly on the line = push" ambiguity: every prop resolves
// cleanly to MORE or LESS.
function toHalfLine(value) {
  if (value <= 0.5) return 0.5;
  return Math.round(value - 0.5) + 0.5;
}

/**
 * Build the canonical line for one player + metric.
 * @param {object} player   { id, name, position: 'G'|'D'|'M'|'F', baselines?: {metric: avg} }
 * @param {string} metric   key from METRICS
 * @returns {object|null}   { metric, label, line, baseline } or null if N/A
 */
// Metrics that scale with attacking output (team strength × player quality).
const OFFENSE = new Set(['goals', 'shotsOn', 'shots', 'assists']);
// Keep every goals prop on a 0.5 line (== "scores at least one"); strength and
// quality move the PAYOUT, not the threshold, so goal cards stay comparable.
const GOALS_BASELINE_CAP = 0.75;
const clampMul = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Build the canonical line for one player + metric.
 * @param {object} player   { id, name, position, baselines? }
 * @param {string} metric   key from METRICS
 * @param {object} [ctx]    matchup context { attackMult, concedeMult, savesMult,
 *                          quality } — when present, baselines are adjusted by
 *                          team strength + player quality (see strength.js).
 */
export function buildLine(player, metric, ctx) {
  const pos = player.position || 'M';
  const allowed = POSITION_METRICS[pos] || POSITION_METRICS.M;
  if (!allowed.includes(metric)) return null;

  // Prefer the player's own form if the feed gave us a per-90 average.
  const perPlayer = player.baselines && player.baselines[metric];
  let baseline =
    typeof perPlayer === 'number'
      ? perPlayer
      : (POSITION_BASELINE[pos] && POSITION_BASELINE[pos][metric]) ?? 0.5;

  // Adjust by matchup + quality when a match context is supplied.
  if (ctx) {
    if (OFFENSE.has(metric)) {
      // Star/elite MIDFIELDERS are usually attacking (Bruno Fernandes, De Bruyne,
      // Bellingham…) — don't let a midfield position default suppress their goal
      // threat to a defensive level; lift toward a forward's base.
      const fBase = POSITION_BASELINE.F[metric];
      if (pos === 'M' && fBase != null) {
        // Attacking mids price close to a forward (they're real goal threats);
        // other quality mids (often defensive — Rodri, Casemiro) get a milder
        // lift; a plain squad midfielder gets none.
        const lift = ctx.attMid ? 0.78 : ((ctx.quality ?? 1) >= 1.3 ? 0.55 : 0);
        if (lift) baseline = Math.max(baseline, fBase * lift);
      }
      // Clamp the strength × quality effect, THEN apply the per-player variance —
      // so even at the clamp ceiling/floor (big mismatches) every player stays distinct.
      baseline *= clampMul((ctx.attackMult ?? 1) * (ctx.quality ?? 1), 0.35, 2.2) * (ctx.variance ?? 1);
    } else if (metric === 'conceded') {
      baseline *= (ctx.concedeMult ?? 1);
    } else if (metric === 'saves') {
      baseline *= (ctx.savesMult ?? 1);
    }
    if (metric === 'goals') baseline = Math.min(baseline, GOALS_BASELINE_CAP);
  }

  return {
    metric,
    label: METRICS[metric].label,
    short: METRICS[metric].short,
    line: toHalfLine(baseline),
    baseline, // kept for the scoring engine (drives risk)
  };
}

/**
 * Generate every sensible prop for a single player.
 * @returns {Array} list of line objects (see buildLine)
 */
export function buildPlayerProps(player, ctx) {
  const pos = player.position || 'M';
  const metrics = POSITION_METRICS[pos] || POSITION_METRICS.M;
  return metrics
    .map((m) => buildLine(player, m, ctx))
    .filter(Boolean);
}

/**
 * Generate the full prop set for a match from both squads.
 * Each prop is keyed by `${matchId}:${playerId}:${metric}` so it is stable
 * across re-generation (important for idempotent Cloud Function writes).
 */
export function buildMatchProps(match) {
  const homeName = match.home && match.home.name;
  const awayName = match.away && match.away.name;
  const homeCtx = matchupContext(homeName, awayName);
  const awayCtx = matchupContext(awayName, homeName);

  const props = [];
  const addSide = (players, sideCtx) => {
    for (const player of players || []) {
      const ctx = { ...sideCtx, quality: playerQuality(player.name), variance: playerVariance(player.name), attMid: isAttackingMid(player.name) };
      for (const line of buildPlayerProps(player, ctx)) {
        props.push({
          id: `${match.id}:${player.id}:${line.metric}`,
          matchId: match.id,
          playerId: player.id,
          playerName: player.name,
          team: player.team,
          teamCode: player.teamCode,
          position: player.position,
          ...line,
        });
      }
    }
  };
  addSide(match.home && match.home.players, homeCtx);
  addSide(match.away && match.away.players, awayCtx);
  return props;
}
