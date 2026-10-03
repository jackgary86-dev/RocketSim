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
- [ ] **T11 — Vandenberg southerly launches fall short for Vulcan and Shuttle.** With
  `site: 'vandenberg'` and azimuth 180 (zero Earth-rotation boost) Vulcan Centaur VC4 and
  the Space Shuttle end up suborbital (checked headlessly). Either retune the default
  Vandenberg azimuth (e.g. 160–170° gives some eastward boost), add a per-site payload
  derate shown in the config stats panel, or warn "insufficient Δv from this site" in the
  config warning line. Add a headless per-site orbit check to the verification section of
  this file once all 20 vehicles pass at each site's default azimuth.
- [ ] **T12 — Per-site pad scenery and range safety.** Pad models are Cape-shaped (flame
  trench, tower side). Add per-site pad variants (Vandenberg hillside, Kourou jungle
  treeline, Baikonur flat steppe with railway) in `buildPad` and show a range-safety
  warning when the chosen azimuth overflies land for the site (e.g. Kourou azimuth < 20°,
  Baikonur any azimuth east of 70° overflying China is a non-issue but < 50° drops stages
  on Russia).

## Done

(The routine moves finished tickets here with the commit hash.)

- [x] **T4 — Additional launch sites.** Done: `LAUNCH_SITES` (Cape, Vandenberg SLC-4E, Kourou ELA-4, Baikonur Site 31) in `src/sim/flight.js`; site picker on the config screen (resets/clamps the azimuth slider to the site's range), globe orientation, pad ground texture (coast side / steppe), map marker, shipping/rollout text follow the site. Cape stays default. Branch `ticket/T4-launch-sites`.
