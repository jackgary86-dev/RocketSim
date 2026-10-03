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

- [ ] **T1 — Fictional vehicle name set.** Add a `names` setting (`real` | `fictional`) in
  `src/data/missions.js` settings and the Settings screen. Add a `fictionalName` and
  `fictionalMaker` to every entry in `src/data/rockets.js` (recognisable but original, e.g.
  Falcon 9 → "Kestrel 9", Saturn V → "Titan V", Starship → "Starliner Heavy" is NOT allowed
  because it is a real name — pick unused names). Every place the UI shows `rocket.name` /
  `maker` must go through a `displayName(rocket)` helper. Default to `fictional`.
- [ ] **T2 — Cosmetic fixes.** (a) Rollout erection: rotate about the vehicle base so the
  base stays on the transporter until vertical, then settles on the mount
  (`rolloutPose` in `src/render/scene.js`). (b) Shuttle orbiter: wings should sit on the
  bottom of the fuselage and the orbiter should point nose-up along the tank.
  (c) Pad tracking camera: avoid the tower occluding the vehicle for the first 10 s.
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
- [ ] **T7 — Rocket builder (MVP).** New "Builder" screen: pick a first stage, upper stage,
  optional boosters and nose from the existing catalogue parts, name it, and save it to
  localStorage. Built vehicles appear in the rocket list under a "Custom" class.
- [ ] **T8 — Touch / on-screen controls.** When a touch device is detected, show on-screen
  buttons for pitch/yaw, stage, throttle, map and camera in the flight HUD.
- [ ] **T9 — Tutorial mission.** A guided first flight that highlights each step (fuel,
  checks, authorize, stage, map) with dismissible callouts.
- [ ] **T10 — Desktop packaging.** Add an Electron (or Tauri) wrapper with `npm run
  desktop`, a window icon and a build script producing a Windows installer.

## Done

(The routine moves finished tickets here with the commit hash.)

- [x] **T6 — Replay export.** Results screen now has "Download telemetry CSV" (track + event log) and "Download mission card PNG" (`src/ui/export.js`).
