# RocketSim ticket board

The scheduled routine works this file top to bottom: it picks the **first unchecked
ticket**, implements it fully, verifies it, ticks the box, and commits. One ticket per
run. Keep tickets small enough to finish in one session; split a ticket if it is not.

The routine may **add new tickets** (numbered after the last one) when it finds bugs,
when a ticket needs a follow-up, or when a ticket is too large and must be split into
parts. New tickets go into the backlog in priority order with the same level of detail as
the existing ones. When the backlog is empty, the routine should run a review pass of the
game (play through every screen headlessly where possible, read the code for rough edges)
and file tickets for what it finds, then stop.

Verification for every ticket: `npm install && npm run build` must pass, and the headless
ascent check must still put all 20 vehicles in orbit:

```bash
node --input-type=module -e "
import { ROCKETS } from './src/data/rockets.js';
import { buildVehicle, DEFAULT_CONFIG } from './src/data/config.js';
import { FlightSim } from './src/sim/flight.js';
let fails = 0;
for (const rk of ROCKETS) {
  const sim = new FlightSim(buildVehicle(rk, DEFAULT_CONFIG));
  let n = 0;
  while (sim.t < 4000 && sim.status === 'ascent' && n++ < 400000) sim.step(0.05);
  console.log(rk.name.padEnd(22), sim.status, (sim.tel.el.periapsis/1000).toFixed(0), 'km perigee');
  if (sim.status !== 'orbit') fails++;
}
if (fails) { console.error(fails + ' vehicles failed to reach orbit'); process.exit(1); }
"
```

## Backlog (in priority order)

- [ ] **T3 — Scrub detank polish.** When a scrub is called during the terminal count after
  ignition, show an "engine shutdown — pad safing" message, shut the plume off over 1 s and
  keep the vehicle on the pad. After detank, "Recycle" must restart fueling with fresh
  tanks and a new `FuelingSequence`.
- [ ] **T4 — Additional launch sites.** Add Vandenberg SLC-4E (34.632°N, 120.611°W, coast
  to the west, azimuth range 140–200°), Kourou ELA-4 (5.239°N, 52.768°W, coast east) and
  Baikonur Site 31 (45.996°N, 63.564°E, inland) to `src/sim/flight.js` as selectable
  `LAUNCH_SITES`. Site picker on the configuration screen; the pad ground texture, the
  azimuth slider range and the map marker follow the site. Cape Canaveral stays default.
- [ ] **T5 — Career mode (money).** New menu entry "Career". Start with $250M. Each launch
  costs hardware (sum of `dry` tonnes × $1.2M/t for liquid stages, $0.4M/t for solids) plus
  propellant (from the shipping manifest, $2k/t kerolox, $6k/t hydrolox, $1.5k/t methalox,
  $25k/t hypergolic). Missions pay a `reward` (add to each mission in
  `src/data/missions.js`, $20M–$400M by difficulty). Failed launches pay nothing. Reusable
  boosters that land refund 60% of their stage cost. Balance persists in localStorage;
  show it on the menu and results screens.
- [ ] **T6 — Replay export.** Record the flight track (`sim.track` plus events) and add a
  "Download telemetry CSV" and "Download mission card PNG" (canvas-rendered summary:
  vehicle, orbit, score, map thumbnail) to the results screen.
- [ ] **T7 — Rocket builder (MVP).** New "Builder" screen: pick a first stage, upper stage,
  optional boosters and nose from the existing catalogue parts, name it, and save it to
  localStorage. Built vehicles appear in the rocket list under a "Custom" class.
- [ ] **T8 — Touch / on-screen controls.** When a touch device is detected, show on-screen
  buttons for pitch/yaw, stage, throttle, map and camera in the flight HUD.
- [ ] **T9 — Tutorial mission.** A guided first flight that highlights each step (fuel,
  checks, authorize, stage, map) with dismissible callouts.
- [ ] **T10 — Desktop packaging.** Add an Electron (or Tauri) wrapper with `npm run
  desktop`, a window icon and a build script producing a Windows installer.

- [ ] **T11 — Remove remaining real-world names from the shipped data.** T1 only covers the vehicle name and maker. Also replace, in fictional mode, the real stage names (`S-IC`, `Centaur`, `ICPS`, `P80`, `Blok A core`, `Common Core Booster`, `EAP`, `GEM 63XL`, ...), the real-engine mentions in `desc` text (`RD-180`, `RS-25`, `Merlin 1D`, `Raptor`, `BE-4`, ...), and the real manufacturer cities in the shipping `ORIGINS` table in `src/sim/delivery.js`. Add `fictionalStages` / `fictionalDesc` to the data (or a lookup in `fictional.js`) and a `displayStage(rocket, i)` / `displayDesc(rocket)` helper; use them in the fuel screen, stage list, fueling console, HUD stage panel, event log and results. The real names keep working when the setting is `real`.
- [ ] **T12 — Mission text and tutorial copy audit.** Review `src/data/missions.js`, `README.md` and `ROADMAP.md` for third-party names used as product copy (README and ROADMAP may keep real names strictly as "inspired by" references). Add a one-line "inspired by" credits note to the Settings screen.

## Done

- [x] **T2 — Cosmetic fixes.** Rollout erection now pivots about the vehicle base (transporter fixed under the hinge, backs away, base settles on the mount); Shuttle orbiter re-oriented belly-in against the tank with wings along ±Z and a vertical tail; SRBs sit at ±Z; pad camera moved to the +X side so the tower never overlaps the vehicle (checked for all 20 vehicles). Verified: build passes, 20/20 orbit.
- [x] **T1 — Fictional vehicle name set.** `names` setting (fictional | real, default fictional) with a Settings toggle; original names for all 20 vehicles in `src/data/fictional.js`; every UI / voice / map / livery label goes through `displayName` / `displayMaker` in `src/data/names.js`. Verified: build passes, 20/20 vehicles reach orbit.
