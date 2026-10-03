// Career mode: launch costs, mission payouts and a browser-saved cash balance ($ millions).

export const START_FUNDS = 250;
const HARDWARE_RATE = { liquid: 1.2, solid: 0.4 };                  // $M per tonne of dry mass
const PROP_RATE = { kerolox: 0.002, hydrolox: 0.006, methalox: 0.0015, hypergolic: 0.025 }; // $M per tonne
export const REFUND_FRACTION = 0.6;

const unitCost = (s, count = 1) => {
  const hardware = s.dry * count * (s.fuel === 'solid' ? HARDWARE_RATE.solid : HARDWARE_RATE.liquid);
  const propellant = s.fuel === 'solid' ? 0 : s.prop * count * (PROP_RATE[s.fuel] || 0);
  return { hardware, propellant, total: hardware + propellant };
};

/** Cost of one launch in $M: per-stage and per-booster-group breakdown plus totals. */
export function launchCost(vehicle) {
  const stages = vehicle.stages.map((s) => unitCost(s));
  const boosters = vehicle.boosters.map((b) => unitCost(b, b.count));
  const hardware = [...stages, ...boosters].reduce((a, c) => a + c.hardware, 0);
  const propellant = [...stages, ...boosters].reduce((a, c) => a + c.propellant, 0);
  return { stages, boosters, hardware, propellant, total: hardware + propellant };
}

/** $M refunded for reusable hardware that landed (60% of that stage's cost). */
export function refundFor(vehicle, sim) {
  const cost = launchCost(vehicle);
  let refund = 0;
  for (const d of sim.debris) {
    if (!d.reusable || !d.impact?.landed) continue;
    if (d.kind === 'stage' && cost.stages[d.index]) refund += cost.stages[d.index].total;
    else if (d.kind === 'booster' && cost.boosters[d.index]) {
      const b = vehicle.boosters[d.index];
      if (b) refund += cost.boosters[d.index].total / b.count;
    }
  }
  return refund * REFUND_FRACTION;
}

export const fmtMoney = (m) => (Math.abs(m) >= 100 ? `$${m.toFixed(0)}M` : `$${m.toFixed(1)}M`);

const KEY = 'rocketsim.career.v1';
export const career = {
  data: { balance: START_FUNDS, launches: 0 },
  load() {
    try { const raw = localStorage.getItem(KEY); if (raw) this.data = { ...this.data, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
  get balance() { return this.data.balance; },
  canAfford(cost) { return this.data.balance >= cost; },
  charge(cost) { this.data.balance -= cost; this.data.launches++; this.save(); },
  credit(amount) { this.data.balance += amount; this.save(); },
  reset() { this.data = { balance: START_FUNDS, launches: 0 }; this.save(); },
};
