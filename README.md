# RocketSim

A browser-based, mission-control-style launch simulator. Pick one of 20 real-world
launch vehicles, choose its propellant, tune it for range, watch the hardware and
propellant ship to the Cape, roll it out to LC-39A, load it by hand, run the safety
and go/no-go checks, authorise the launch and fly a multi-stage ascent to orbit over a
full-size Earth — with a world map tracking every stage, fairing and the returning
booster.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (normally `http://localhost:5173`). `npm run build`
produces a static site in `dist/`.

## Game flow

Menu → Free Play / Missions → **Rocket** → **Propellant** → **Configuration** →
**Shipping** (15–60 s manifest slideshow, vehicle assembles in the hangar) → **Rollout**
→ **Fueling** (hands-on: vents, tank loads, pressurise, arm; 60–120 s) → **Safety &
pre-launch checks** → go/no-go poll → **Launch authorisation** → T-10 → **Flight** →
**Orbit operations** → Results.

## Controls (flight)

| Key | Action |
| --- | --- |
| W / S | pitch down / up |
| A / D | yaw left / right |
| Q / E | throttle down / up |
| SPACE | separate next stage / boosters |
| X / R | engine cutoff / relight |
| T | toggle autopilot |
| 1 / 2 | hold prograde / retrograde (orbit ops) |
| P | deploy payload (in orbit, fairing off) |
| M | full-screen world map (wheel zoom, drag pan) |
| C | cycle camera: chase · pad · onboard · free · globe |
| , / . | time warp down / up |
| U | imperial ↔ metric |
| ESC | pause |

Difficulty (Settings): **Easy** — autopilot flies and stages; **Normal** — autopilot
flies, you stage; **Hard** — you fly pitch, heading, throttle and staging.

## Physics

* 3-DOF point-mass ascent in an Earth-centred inertial frame with a rotating
  spherical Earth (Cape Canaveral launch gains ~400 m/s eastward).
* 1976 Standard Atmosphere, Mach-dependent drag, pressure-dependent specific impulse.
* Parallel booster burns, core throttling (Delta IV Heavy / Falcon Heavy), g-limiting
  (Shuttle), structural q·α limit → breakup.
* Guidance: vertical rise → gravity turn with an angle-of-attack limiter → closed-loop
  insertion that solves for a flat arrival at the target altitude at circular speed.
* Reusable boosters fly an entry burn and a constant-deceleration landing burn to a
  droneship downrange; spent stages and fairing halves are propagated ballistically and
  their splashdown points are plotted.
* Orbit operations: prograde / retrograde holds, relights, payload deployment, deorbit,
  entry interface, plasma blackout, splashdown.

Headless sanity test for all 20 vehicles:

```bash
node --input-type=module -e "import('./src/sim/flight.js')"
```

(see `src/sim/flight.js` — `FlightSim` runs without a DOM.)

## Project layout

```
src/
  data/      rockets.js (20 vehicles), config.js (propellants, upgrades, Δv stats), missions.js
  sim/       math.js, flight.js (ascent + orbit ops), fueling.js, prelaunch.js, delivery.js
  render/    scene.js (three.js world, floating origin), rocketMesh.js (procedural models), map.js, audio.js
  ui/        ui.js (screens & HUD), units.js
  main.js    state machine and frame loop
public/textures  Earth textures (three.js examples, MIT)
```

## Notes

* Vehicle figures are approximate public numbers tuned so that each vehicle flies in
  its real performance class. Names of real vehicles are used for reference only.
* Progress and settings are stored in `localStorage`.
* See `ROADMAP.md` for what comes next.
