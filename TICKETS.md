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

- [ ] **T13 — Fueling: valve control and pressure management.** Replace "click Start load and wait" with active control. Each tank gets a fill-rate slider (valve 0–100 %) and a pressure gauge with a green band. Faster fills raise pressure and boil-off; going over the band trips a relief valve (propellant lost) and, repeated, a hold. Provide a "Vent" button per cryogenic tank. Easy difficulty keeps today's auto-regulated behaviour; Normal/Hard use manual valves (`FuelingSequence` in `src/sim/fueling.js`, UI in `src/ui/ui.js`).
- [ ] **T14 — Fueling: boil-off, topping and a real link into the flight.** Cryogenic tanks that reach 100 % lose level at ~0.03 %/s unless "Replenish" is on; make that visible (level drift, vent plume). The levels at T-0 must feed the flight: `FlightSim` currently always launches with full tanks, so scale `stageProp[i]` by the tank levels (and booster propellant for solids stays full). Underfilled or boiled-off tanks therefore cost real Δv; show a "propellant on board" line on the authorise screen.
- [ ] **T15 — Fueling: pad visuals and sound.** Tanker trucks and hoses connected to the vehicle during loading, frost that builds on cryogenic tanks, denser vapour while venting, ice falling away at ignition, pump hum / valve hiss / relief-valve pop in `src/render/audio.js`, and camera shortcuts (1–3) to the vehicle base, tank farm and tower.
- [ ] **T16 — Fueling: schedule bonus and timed decisions.** Show a schedule bar with the target load time; finishing without holds and with minimal boil-off earns a bonus added to the mission score. When a hold occurs, the player chooses between options with consequences (swap to redundant sensor = small delay; isolate and continue = risk; scrub). Persist a "pad time" best per vehicle.
- [ ] **T17 — Build screen: live 3D preview and ascent prediction.** Show the vehicle in a 3D viewport beside the sliders that updates live (stretch lengthens tanks, extra boosters appear, fins change). Add a "Simulate ascent" button that runs `FlightSim` headless in a Web Worker and reports predicted orbit, max-Q, peak g, gravity/drag losses and per-stage Δv bars, plus a ghost (previous config) comparison.
- [ ] **T18 — Build trade-offs and budget.** Every upgrade gets a cost and a real downside: engine uprate raises failure chance, tank stretch lowers TWR, composites cost money, extended nozzles hurt sea-level Isp, extra strap-ons add structural-load risk. Add a budget cap, show a "reliability" figure, and make `FlightSim`'s random-failure probability depend on it.
- [ ] **T19 — Contract-first build: payload choice.** Before configuring the rocket the player picks a payload type (comsat, science probe, station module, crew capsule) with its own mass, target orbit, inclination and reward; the build screen shows a requirements checklist (Δv margin, payload mass, orbit) with green ticks. Missions in `src/data/missions.js` reference payload types.
- [ ] **T20 — Shipping as a decision, plus an optional static fire.** For large shipments the player chooses the transport (barge: cheap/slow, rail, air freight: fast/expensive) which sets the delivery time and cost and can trigger a delay event. After rollout add an optional "static fire" step (3 s hold-down burn) that can reveal an engine fault early (costs time, saves a failed launch).

- [ ] **T21 — Realistic aerodynamic heating on the vehicle (requested).** Drive a per-vehicle heat state from `tel.heat` (0.5·rho·v³, already in `FlightSim.computeTelemetry`) plus a stagnation-point temperature estimate. In `RocketModel` add a heat uniform / emissive tint on the nose, fairing, leading edges of fins and booster noses: no effect below ~400 K, a dull red glow from ~800 K, orange to white-hot with a bright bow shock sprite and a short ionised wake above ~1,600 K. Include (a) ascent heating (small, peaks around Mach 6–8 at 40–60 km), (b) booster/ship entry and the deorbit reentry of the upper stage, with plasma colouring and the existing blackout text, (c) a HUD "skin temperature" readout with a warning band, and (d) tile / ablator burn-through only when the player enters too steep or too shallow (add a reentry-corridor failure). Cooling after the peak must be gradual (thermal mass), not instant.
- [ ] **T22 — Lighting and look fixes found in the demo.** (a) On the pad and in the showcase the vehicle often renders as a dark silhouette (sun behind it); add a fill light / hemisphere boost and rotate the sun so the pad camera side is lit. (b) The exhaust plume is a very large near-white blob in daylight (additive blending saturates); reduce opacity and size at low altitude and keep colour. (c) The first frame after ignition screenshot is black on slow GPUs — render a frame before starting the countdown.
- [ ] **T23 — UI overlaps and unit consistency.** (a) The map info panel overlaps the left HUD in map view; move it or hide the HUD telemetry while the map is open. (b) Shipping titles use tonnes (`Payload — 18.0 t`) while masses are shown in lb; route `fmtT` in `src/sim/delivery.js` through `src/ui/units.js`. (c) The delivery panel hides the vehicle assembling on the left; shift the camera target to the right half of the screen.
- [ ] **T24 — Performance on low-end GPUs.** The preview ran at only a few fps, which makes the countdown and fueling feel slow (the frame loop clamps dt to 0.1 s so game time lags real time). Add a quality setting (Low/Med/High) that lowers the Earth sphere segments, disables the logarithmic depth buffer and the cloud layer on Low, caps pixel ratio, and a fixed-timestep accumulator so game time stays correct on slow frames.

## Done

- [x] **T3 — Scrub detank polish.** A scrub after ignition shuts the plume off over 1 s with an "Engine shutdown — pad safing" message and keeps the vehicle on the pad; a new Scrub screen shows the detank progress and log; "Recycle the count" starts a brand-new `FuelingSequence` (empty tanks, idle phase). Verified in the browser: throttle ramps 0.95 -> 0, never lifts off, recycle gives a new sequence; build passes, 20/20 orbit.
- [x] **T2 — Cosmetic fixes.** Rollout erection now pivots about the vehicle base (transporter fixed under the hinge, backs away, base settles on the mount); Shuttle orbiter re-oriented belly-in against the tank with wings along ±Z and a vertical tail; SRBs sit at ±Z; pad camera moved to the +X side so the tower never overlaps the vehicle (checked for all 20 vehicles). Verified: build passes, 20/20 orbit.
- [x] **T1 — Fictional vehicle name set.** `names` setting (fictional | real, default fictional) with a Settings toggle; original names for all 20 vehicles in `src/data/fictional.js`; every UI / voice / map / livery label goes through `displayName` / `displayMaker` in `src/data/names.js`. Verified: build passes, 20/20 vehicles reach orbit.
