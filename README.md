# Golazo — Imperial World Cup 2026 prediction game

A PrizePicks-style player-props game built for Imperial College students: call **MORE** or **LESS** on player stat lines, lock your best **5 picks** a day (or go all-in with a **Power Play** parlay / a **2× Captain**), and climb the all-Imperial leaderboard or a private group. No betting — points and bragging rights only.

**▶ Live app:** https://golazo-wc.web.app · **Mock demo:** https://mustafa-os.github.io/golazo-wc26/

![Golazo — call MORE or LESS on World Cup player props](public/og.png)

---

## 1. Run it right now (30 seconds)

```bash
npm install
npm run dev
```

Open the local URL. With no `.env`, the app runs in **MOCK_MODE** on sample
fixtures (England v Croatia, Argentina v Algeria) so you can see and feel the whole
game — sign-in, the match rail, props, the More/Less mechanic, the slip, leaderboard,
groups — before any backend exists. There's a one-tap **"Try the demo"** button too.

---

## 2. How the game works

**Lines** (`src/lib/lineEngine.js`) — every player gets over/under lines on the
metrics that suit their position (strikers: goals/shots; keepers: saves; etc.).
Lines are half-numbers (0.5, 1.5, 2.5…) so every prop resolves cleanly. No odds feed
needed — lines come from position baselines, upgraded to a player's own form when the
stats feed provides it.

**Scoring** (`src/lib/scoringEngine.js`) — risk-weighted. A pick's value ≈ `1 / P(it lands)`,
where the probability is modelled with a Poisson tail on the metric's baseline. A safe
shot-on-target pays ~5–8 pts; a striker brace or a keeper scoring pays up to 100. Wrong
picks score **0** (never negative), and a picked player who doesn't play is **void** —
the standard DFS "Did Not Play" rule. The engine also supports a daily-streak
multiplier of up to +50%.

Both engines are plain dependency-free JS, imported by **both** the frontend (to
preview points) and the Cloud Functions (to award them) — so they can never disagree.
`npm test` runs 45 assertions over them.

---

## 3. The architecture that makes it scale

**Users never call the football API.** Scheduled Cloud Functions hit API-Football on
a schedule and cache everything in Firestore; every student reads from Firestore
(huge free tier). 10 players or 1,000 — API usage is identical.

```
                 (scheduled)
  API-Football  ───────────────────────▶  Cloud Functions  ───▶  Firestore
   fixtures                                generate props          (matches,
   lineups                                 resolve & score          props,
   player stats                            roll leaderboard         users, slips,
                                                                    leaderboards, groups)
                                                                        │
                                                  all users read  ◀─────┘
```

- `generateDailyProps` (daily, 08:00 London): full schedule + squads → write props for every match inside the 5-day "open" window
- `resolveFinished` (every 15 min): finished matches → player stats → settle each slip as a whole once **all** its matches are done (required for parlays), award points idempotently
- `recomputeLeaderboard` (every 5 min): roll user totals into cached all-time and weekly boards
- `joinGroup` / `leaveGroup` (callables): group membership changes go through the server, since direct group writes are blocked by the Firestore rules

Sign-in is Google-only; Imperial status is verified at onboarding by student
shortcode (`src/config.js`) rather than email domain, since Imperial students use
personal Google accounts.

### Three run modes (`src/firebase.js`)

| Mode | Trigger | Backend |
|------|---------|---------|
| **MOCK** | no `.env` | runs entirely on `mockData.js` (default `npm run dev`) |
| **EMULATOR** | `VITE_FB_EMULATOR=1` | real Firebase SDK → local Emulator Suite |
| **LIVE** | `VITE_FB_API_KEY` set | your real Firebase project |

Every page is backend-agnostic via `AuthContext` / `DataContext` and the
`slipStore` / `groupStore` modules — the same UI runs on mock, emulator, or live.

---

## 4. Going live (Firebase + API-Football)

### a) Firebase *(unlocks Auth, live data, slips, leaderboards, groups)*
1. Create a project at <https://console.firebase.google.com>.
2. Enable **Authentication** (Google provider) and **Firestore**.
3. Copy your web config into `.env` (see `.env.example`). The app leaves MOCK_MODE
   automatically once `VITE_FB_API_KEY` is set.
4. `firebase use --add` (writes `.firebaserc`), then deploy rules + indexes:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

### b) API-Football *(unlocks prop generation + resolution)*
1. Sign up at <https://www.api-football.com>. The free tier is enough to wire
   everything up; live in-tournament resolution needs a paid tier with live data
   and player stats.
2. Store the key as a Functions secret — never in client code:
   ```bash
   firebase functions:secrets:set API_FOOTBALL_KEY
   ```

### c) Functions
The engines are ES modules; the functions runtime uses `require`. An esbuild step
converts them to `.cjs` next to `index.js` (wired into `predeploy`):
```bash
cd functions && npm install && npm run deploy   # builds engines + deploys
```

### d) Frontend hosting
```bash
npm run build
firebase deploy --only hosting        # Firebase Hosting (firebase.json -> dist, SPA rewrite)
```
A MOCK_MODE demo also auto-deploys to **GitHub Pages** on every push to `main`
(`.github/workflows/deploy.yml` — CI runs the engine tests and build first).

---

## 5. Local development against the emulator (no cloud needed)

Test the full live code path — real Auth, Firestore reads/writes, security rules,
and the group callables — entirely offline (needs Java for the Firestore emulator):

```bash
# terminal 1 — emulators (auth, firestore, functions)
cd functions && npm install && npm run build:engines && cd ..
firebase emulators:start --only auth,firestore,functions --project demo-over-wc26

# terminal 2 — seed sample matches/props/leaderboard/groups, then run the app
npm run seed
npm run dev:emulator        # http://localhost:5174  (VITE_FB_EMULATOR=1)
```

## 6. Tests

```bash
npm test     # engine unit tests (lineEngine + scoringEngine), 45 assertions
```

The same tests run in CI before every GitHub Pages deploy. During development the
build was also verified headlessly: full mock UI flow, the live emulator UI flow,
a security-rules suite, and the groups/callable suite.

---

## File map

```
src/
  lib/lineEngine.js       line generation (positions, baselines, half-lines)
  lib/scoringEngine.js    risk-weighted points + slip settlement (Poisson)
  lib/mockData.js         sample fixtures/squads for MOCK_MODE
  lib/mockAuth.js         localStorage auth stand-in for MOCK_MODE
  lib/slipStore.js        slip persistence (mock + Firestore)
  lib/groupStore.js       groups (mock + Firestore + callables)
  firebase.js             guarded init (MOCK / EMULATOR / LIVE)
  config.js               Imperial shortcode validation (onboarding gate)
  context/AuthContext.jsx auth state machine over both backends
  context/DataContext.jsx matches + props + leaderboard subscriptions
  App.jsx                 shell: auth gate, slip state, lock-at-kickoff, nav
  components/             PropCard (More/Less), PickSlip (slip + results + share)
  pages/                  AuthScreen, Onboarding, Today, Leaderboard, Groups, Profile
functions/
  index.js                scheduled jobs + group callables
  apiFootball.js          API-Football client (server-side only)
firestore.rules           server-only matches/props, protected points, owner-only
                          slips (locked = one-way latch), member-read groups
firebase.json             rules + indexes + functions + hosting + emulator config
scripts/                  seed.mjs (emulator seed), test-engines.mjs (npm test)
```

---

## Project context

Personal project, built in June 2026 in the run-up to and during the 2026 FIFA World
Cup, for Imperial College students to play along with the tournament. Stack: React 18 +
Vite + Tailwind CSS, Firebase (Auth, Firestore, Cloud Functions, Hosting), API-Football.

---

Built by Mustafa Suleman — MEng Design Engineering, Imperial College London · [LinkedIn](https://www.linkedin.com/in/mustafaosuleman/)
