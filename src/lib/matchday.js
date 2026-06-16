// ============================================================================
// MATCH DAYS
// ----------------------------------------------------------------------------
// Group fixtures into match days by US Eastern calendar date (the 2026 WC is
// US-hosted), and classify each as previous / open / upcoming. "Open" = the next
// OPEN_COUNT not-yet-played match days (a rolling window — when one finishes the
// next unlocks); upcoming = locked; previous = results.
// ============================================================================

// Central, not Eastern: the WC spans US time zones, and grouping by Eastern
// pushed late-night games (e.g. a West-Coast or midnight-ET kickoff) into the
// NEXT day's match day, where — being earliest — they locked it hours early.
// Central keeps those late games in their own slate.
export const US_TZ = 'America/Chicago';
// The next 3 unplayed match days are playable; everything after them stays
// locked and unlocks one-by-one as earlier match days finish.
export const OPEN_COUNT = 3;

export const usDateKey = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: US_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
export const usDateLabel = (iso) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: US_TZ, weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(iso));
export const usToday = () => usDateKey(Date.now());

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

// A game counts as finished once the API marks it full-time (resolveFinished
// also flips `settled`). AET/PEN/AWD/WO cover knockout + awarded results.
const FINISHED_STATUS = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const gameFinished = (g) => g?.settled === true || FINISHED_STATUS.has(g?.status);

// → [{ key, n, label, status:'previous'|'open'|'upcoming', games:[...] }] sorted.
export function buildMatchdays(matches) {
  const byDay = new Map();
  for (const m of matches) {
    const k = usDateKey(m.kickoff);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(m);
  }
  const today = usToday();
  let openTaken = 0; // first OPEN_COUNT not-yet-played match days are open; rest lock
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, games], i) => {
      const sorted = [...games].sort((x, y) => new Date(x.kickoff) - new Date(y.kickoff));
      // Done = every game full-time → drops to Results immediately and frees up
      // the next locked match day. The date check is a fallback for any game the
      // API never marks finished.
      const allDone = sorted.every(gameFinished);
      let status;
      if (allDone || dayDiff(today, key) < 0) status = 'previous';
      else if (openTaken < OPEN_COUNT) { status = 'open'; openTaken += 1; }
      else status = 'upcoming';
      return { key, n: i + 1, label: usDateLabel(sorted[0].kickoff), status, games: sorted };
    });
}

// Earliest kickoff (ms) among a matchday's games — drives the 30-min auto-lock.
export function matchdayKickoff(games) {
  return Math.min(...games.map((g) => new Date(g.kickoff).getTime()));
}

export const LOCK_LEAD_MS = 30 * 60 * 1000; // slips auto-lock 30 min before KO
