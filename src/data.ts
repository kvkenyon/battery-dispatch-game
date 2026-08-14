import type { DayData, Site } from './types';

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: string): () => number {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SITE_BLUEPRINTS = [
  ['Aster House', '8 Switchgrass Ln', 12, 4, 0.90, 158, 13, 25, '#f6c85f'],
  ['Juniper House', '24 Jackrabbit Ct', 10, 5, 0.88, 142, 26, 18, '#e68c62'],
  ['Mesa House', '11 Copper Sky Rd', 16, 4, 0.92, 215, 40, 29, '#65b9ac'],
  ['Coyote House', '37 Switchgrass Ln', 9, 3, 0.86, 116, 59, 18, '#e4a4c4'],
  ['Bluebonnet House', '5 Lantern Way', 14, 6, 0.91, 205, 78, 27, '#7aa6d8'],
  ['Pecan House', '42 Lantern Way', 11, 4, 0.89, 150, 89, 16, '#c5a36c'],
  ['Sunstone House', '19 Kestrel Ave', 18, 5, 0.93, 242, 18, 59, '#f1b24b'],
  ['Arroyo House', '31 Kestrel Ave', 8, 4, 0.85, 102, 35, 68, '#8fbf7f'],
  ['Tumbleweed House', '7 Longhorn Loop', 13, 3, 0.90, 151, 54, 59, '#ce8a73'],
  ['Nightjar House', '26 Longhorn Loop', 15, 5, 0.92, 208, 71, 71, '#8995d3'],
  ['Prairie House', '51 Copper Sky Rd', 10, 4, 0.87, 126, 87, 57, '#d0b86d'],
  ['Limestone House', '3 Moonrise Mews', 20, 5, 0.94, 281, 48, 88, '#83b7a1'],
  ['Sage House', '17 Moonrise Mews', 12, 6, 0.88, 176, 68, 89, '#bb91c7'],
  ['Cricket House', '29 Jackrabbit Ct', 7, 3, 0.84, 82, 91, 88, '#d78b56'],
] as const;

const PRICE_SHAPES = [
  [22,20,18,17,18,22,30,38,42,36,31,27,25,26,29,34,43,61,78,67,48,36,29,25],
  [18,16,15,14,14,18,26,34,38,30,14,-8,-14,-6,10,27,45,72,91,74,52,34,25,21],
  [29,27,25,24,25,31,43,56,62,55,49,44,42,45,53,70,98,132,118,86,61,47,38,32],
  [21,19,17,16,16,20,29,41,49,38,24,7,-11,-18,-5,17,46,88,112,84,51,34,27,23],
  [25,23,22,21,23,29,39,52,58,51,46,43,45,49,58,74,97,128,145,103,68,49,37,30],
  [17,15,14,13,14,19,28,39,44,33,13,-16,-25,-12,8,35,63,119,156,108,66,41,29,22],
] as const;

const DAY_META = [
  ['The Evening Ramp', 'Clear · 91°F', 'A simple price spread rewards batteries that wait for the evening peak.'],
  ['Solar Flood', 'Bright · 96°F', 'Midday prices can fall below zero: the grid pays flexible loads to absorb energy.'],
  ['Heat Dome', 'Still · 104°F', 'A broad, expensive peak makes capacity and power trade off in surprising ways.'],
  ['Forecast Front', 'Breezy · 94°F', 'The line is a forecast now. Your locked plan meets the price that actually arrives.'],
  ['Peak Watch', 'Humid · 101°F', 'A wider error band around the peak raises the value of robust timing.'],
  ['The Long Sunset', 'Clouds building · 99°F', 'Negative noon prices and an uncertain sunset create the final dispatch puzzle.'],
] as const;

function jitter(value: number, random: () => number, spread: number): number {
  return Math.round((value + (random() - 0.5) * spread) * 10) / 10;
}

function createSites(dayIndex: number, random: () => number): Site[] {
  const count = Math.min(10 + dayIndex, SITE_BLUEPRINTS.length);
  return SITE_BLUEPRINTS.slice(0, count).map((raw, index) => ({
    id: `home-${index + 1}`,
    name: raw[0], street: raw[1], capacity: raw[2], power: raw[3], efficiency: raw[4],
    installCost: Math.max(65, Math.round(Number(raw[5]) * (0.92 + random() * 0.17))),
    x: raw[6], y: raw[7], color: raw[8],
  }));
}

export function makeDay(matchCode: string, dayIndex: number): DayData {
  const safeIndex = ((dayIndex % 6) + 6) % 6;
  const seed = `${matchCode.trim().toUpperCase() || 'OPEN-GRID'}:${safeIndex}`;
  const random = seededRandom(seed);
  const round = safeIndex < 3 ? 1 : 2;
  const prices = PRICE_SHAPES[safeIndex].map((price) => jitter(price, random, 5));
  const uncertainty = prices.map((_, hour) => round === 1 ? 0 : Math.round(4 + 15 * Math.sin((hour / 23) * Math.PI) + random() * 7));
  return {
    id: `day-${safeIndex + 1}`,
    title: DAY_META[safeIndex][0],
    weather: DAY_META[safeIndex][1],
    lesson: DAY_META[safeIndex][2],
    round,
    dayInRound: (safeIndex % 3) + 1,
    prices,
    uncertainty,
    sites: createSites(safeIndex, random),
    degradationCost: 1.4 + safeIndex * 0.15,
    seed,
  };
}

export function realizePrices(day: DayData): number[] {
  if (day.round === 1) return [...day.prices];
  const random = seededRandom(`${day.seed}:actual`);
  return day.prices.map((forecast, hour) => {
    const triangular = random() + random() - 1;
    return Math.round((forecast + triangular * day.uncertainty[hour]) * 10) / 10;
  });
}

export function buildSequence(matchCode: string): DayData[] {
  return Array.from({ length: 6 }, (_, index) => makeDay(matchCode, index));
}
