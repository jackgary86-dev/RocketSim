// Telemetry formatting. Imperial by default (the player's choice); metric available.
export const units = { system: 'imperial' };

const FT = 3.28084, MI = 0.000621371, LB = 2.20462, PSI = 0.000145038, MPH = 2.23694;

export function alt(m) {
  if (units.system === 'metric') return m < 10000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(1)} km`;
  const ft = m * FT;
  return ft < 30000 ? `${ft.toFixed(0)} ft` : `${(m * MI).toFixed(1)} mi`;
}
export function dist(m) {
  if (units.system === 'metric') return `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`;
  return `${(m * MI).toFixed(m < 160000 ? 1 : 0)} mi`;
}
export function speed(ms) {
  if (units.system === 'metric') return `${ms.toFixed(0)} m/s`;
  return `${(ms * MPH).toFixed(0)} mph`;
}
export function mass(kg) {
  if (units.system === 'metric') return kg < 1000 ? `${kg.toFixed(0)} kg` : `${(kg / 1000).toFixed(1)} t`;
  const lb = kg * LB;
  return lb < 10000 ? `${lb.toFixed(0)} lb` : `${(lb / 1000).toFixed(1)}k lb`;
}
export function massT(t) { return mass(t * 1000); }
export function force(N) {
  if (units.system === 'metric') return `${(N / 1000).toFixed(0)} kN`;
  return `${(N * LB / 1000).toFixed(0)}k lbf`;
}
export function press(Pa) {
  if (units.system === 'metric') return `${(Pa / 1000).toFixed(1)} kPa`;
  return `${(Pa * PSI).toFixed(1)} psi`;
}
export function pressBar(bar) {
  if (units.system === 'metric') return `${bar.toFixed(2)} bar`;
  return `${(bar * 14.5038).toFixed(1)} psi`;
}
export function temp(K) {
  if (units.system === 'metric') return `${(K - 273.15).toFixed(0)} °C`;
  return `${((K - 273.15) * 9 / 5 + 32).toFixed(0)} °F`;
}
export function accel(g) { return `${g.toFixed(2)} g`; }
export const altUnit = () => (units.system === 'metric' ? 'km' : 'mi');
export const toggleUnits = () => { units.system = units.system === 'metric' ? 'imperial' : 'metric'; return units.system; };
