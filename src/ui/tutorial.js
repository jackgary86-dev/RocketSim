// Guided first flight: dismissible callouts shown as the player reaches each step.

const STEPS = {
  rocket: { title: 'Step 1 · Choose a vehicle', text: 'Click a vehicle card to inspect it. Falcon 9 is a good first rocket: pick it, then press "Select propellant".' },
  fuel: { title: 'Step 2 · Propellant', text: 'Each fuel trades thrust against density. The default is fine for a first flight — continue to the configuration.' },
  config: { title: 'Step 3 · Configuration', text: 'Payload and launch azimuth are set here. The defaults reach orbit; press the button to ship the hardware to the Cape.' },
  fueling: { title: 'Step 4 · Fuel the rocket', text: 'Work the buttons in order: 1 Open vents, 2 Start all loads, 3 Pressurise, 4 Arm. Each unlocks when the previous one finishes.' },
  checks: { title: 'Step 5 · Pre-launch checks', text: 'Mission control runs the safety checks and a go/no-go poll by itself. Watch the console and wait for every station to report GO.' },
  authorize: { title: 'Step 6 · Authorize', text: 'All stations are GO. Press AUTHORIZE LAUNCH to start the T-10 countdown.' },
  liftoff: { title: 'Step 7 · Liftoff', text: 'The autopilot flies the gravity turn. Watch altitude and speed on the left; press C to change camera.' },
  stage: { title: 'Step 8 · Stage separation', text: 'The stage has burned out. Press SPACE (or the Stage button) to separate it and light the next stage.' },
  map: { title: 'Step 9 · World map', text: 'Press M to open the full-screen map with your ground track, predicted orbit and falling stages. Press M again to return.' },
  orbit: { title: 'Orbit!', text: 'Once you are in orbit the results screen shows your score. Free Play and the other missions are now open to you.' },
};

export class Tutorial {
  constructor(root) {
    this.root = root;
    this.seen = new Set();
    this.active = true;
    this.el = document.createElement('div');
    this.el.className = 'tutorial';
    this.el.innerHTML = '<div class="tt"><b></b><button data-a="close" title="Dismiss">×</button></div><div class="tx"></div><div class="tf"><button data-a="skip">Skip tutorial</button></div>';
    root.appendChild(this.el);
    this.el.querySelector('[data-a=close]').addEventListener('click', () => this.hide());
    this.el.querySelector('[data-a=skip]').addEventListener('click', () => this.stop());
  }

  /** Show the callout for `id` the first time it is requested; later requests are ignored. */
  show(id) {
    if (!this.active || this.seen.has(id) || !STEPS[id]) return;
    this.seen.add(id);
    this.el.querySelector('.tt b').textContent = STEPS[id].title;
    this.el.querySelector('.tx').textContent = STEPS[id].text;
    this.el.classList.add('on');
  }
  hide() { this.el.classList.remove('on'); }
  stop() { this.active = false; this.hide(); }
  destroy() { this.stop(); this.el.remove(); }
}
