import { settings } from './missions.js';

// Every place that shows a vehicle's name or maker goes through these helpers so the
// "Vehicle names" setting (fictional | real) applies everywhere.
const fictional = () => (settings.data.names ?? 'fictional') === 'fictional';

export function displayName(r) {
  return fictional() && r.fictionalName ? r.fictionalName : r.name;
}

export function displayMaker(r) {
  return fictional() && r.fictionalMaker ? r.fictionalMaker : r.maker;
}
