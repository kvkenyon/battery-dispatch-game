import type { ChapterManifest, DayData, DemandResponseEvent, Site } from './types';

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

export const FOUNDERS_PREVIEW = true;

export const CAMPAIGN_MANIFEST: ChapterManifest[] = [
  { id: 'spread-school', number: 1, title: 'Spark School', shortTitle: 'Spreads', concept: 'Buy in a price valley, respect state of charge, and sell into a peak.', fieldGuide: 'A price spread is the distance between what energy costs when you charge and what it earns when you discharge. Capacity limits how much you can carry across that gap; power limits how fast you can move it.', tier: 'free', color: '#ffd166' },
  { id: 'fleet-yard', number: 2, title: 'The Fleet Yard', shortTitle: 'Fleet economics', concept: 'A battery is only useful if its market earnings repay its installation cost.', fieldGuide: 'Site selection is a fixed-charge decision: installing unlocks a battery’s dispatch, but its full fixed cost lands immediately. The optimizer can skip attractive hardware when the day’s spreads cannot pay for it.', tier: 'free', color: '#8ee3c8' },
  { id: 'physics-lab', number: 3, title: 'Friction Junction', shortTitle: 'Physics taxes', concept: 'Efficiency losses and wear turn small spreads into bad trades.', fieldGuide: 'Round-trip efficiency means some purchased energy never returns to the grid. Degradation charges a wear cost on every kWh moved. Together they create a minimum profitable spread—and sometimes the best move is idle.', tier: 'free', color: '#ff9b73' },
  { id: 'forecast-room', number: 4, title: 'Forecast Radio', shortTitle: 'Forecast risk', concept: 'Plans lock against a forecast, but the real market gets the last word.', fieldGuide: 'A greedy plan aims at one forecast peak. A robust plan preserves options across several plausible hours. Gridville settles your locked actions against one seeded realization so every player with the same match code faces the same surprise.', tier: 'premium', color: '#a9b8ff' },
  { id: 'ercot-country', number: 5, title: 'ERCOT Country', shortTitle: 'Market operations', concept: 'Congestion, scarcity, negative prices, and grid programs reshape value by place and time.', fieldGuide: 'ERCOT coordinates most of the Texas grid. Day-ahead prices are plans; real-time prices settle deviations. Scarcity can make prices jump, solar surplus can push them below zero, and transmission congestion can separate neighborhood zones. Ancillary services and demand-response programs pay flexibility, not just energy.', tier: 'premium', color: '#f7c85c' },
  { id: 'vpp-final', number: 6, title: 'VPP Control', shortTitle: 'VPP boss', concept: 'Coordinate sites, physics, zones, uncertainty, and a grid event as one virtual power plant.', fieldGuide: 'A virtual power plant makes many small devices behave like one flexible resource. The full model chooses sites and hourly dispatch together because every local decision changes the value of the fleet around it.', tier: 'premium', color: '#d7ff63' },
];

// Future entitlement providers plug in here. Founders preview intentionally unlocks
// every chapter; there is no account, checkout, payment SDK, or hidden transaction.
export function isChapterAvailable(chapter: ChapterManifest, hasPremiumEntitlement = false): boolean {
  return chapter.tier === 'free' || FOUNDERS_PREVIEW || hasPremiumEntitlement;
}

const SITE_BLUEPRINTS = [
  ['Aster House', '8 Switchgrass Ln', 12, 4, 0.90, 158, 13, 25, '#ffd166'],
  ['Juniper House', '24 Jackrabbit Ct', 10, 5, 0.88, 142, 26, 18, '#ff9675'],
  ['Mesa House', '11 Copper Sky Rd', 16, 4, 0.92, 215, 40, 29, '#66d2bd'],
  ['Coyote House', '37 Switchgrass Ln', 9, 3, 0.86, 116, 59, 18, '#f3a7d5'],
  ['Bluebonnet House', '5 Lantern Way', 14, 6, 0.91, 205, 78, 27, '#85b8ff'],
  ['Pecan House', '42 Lantern Way', 11, 4, 0.89, 150, 89, 16, '#d9ad72'],
  ['Sunstone House', '19 Kestrel Ave', 18, 5, 0.93, 242, 18, 59, '#ffc456'],
  ['Arroyo House', '31 Kestrel Ave', 8, 4, 0.85, 102, 35, 68, '#9bd48c'],
  ['Tumbleweed House', '7 Longhorn Loop', 13, 3, 0.90, 151, 54, 59, '#dc967f'],
  ['Nightjar House', '26 Longhorn Loop', 15, 5, 0.92, 208, 71, 71, '#9ba8ef'],
  ['Prairie House', '51 Copper Sky Rd', 10, 4, 0.87, 126, 87, 57, '#dfc377'],
  ['Limestone House', '3 Moonrise Mews', 20, 5, 0.94, 281, 48, 88, '#8ccdb1'],
  ['Sage House', '17 Moonrise Mews', 12, 6, 0.88, 176, 68, 89, '#cc9ddd'],
  ['Cricket House', '29 Jackrabbit Ct', 7, 3, 0.84, 82, 91, 88, '#e99a63'],
] as const;

type DayBlueprint = {
  chapterId: string;
  title: string;
  weather: string;
  lesson: string;
  alert: string;
  gossip: string;
  rival: string;
  prices: readonly number[];
  siteCount: number;
  degradation: number;
  boss?: boolean;
  forecastRisk?: number;
  zonal?: boolean;
  demandResponse?: DemandResponseEvent;
};

const CAMPAIGN_DAYS: DayBlueprint[] = [
  {
    chapterId: 'spread-school', title: 'First Spark', weather: 'Honey sun · 88°F', lesson: 'Carry cheap noon energy into the obvious evening spike.', alert: 'TRAINING FEED · One battery. One glorious spike. No excuses.', gossip: 'Mrs. Luna says her toaster can beat a spreadsheet. Please defend our profession.', rival: 'Rae Current: “I’ll give you a head start. You look like you need one.”', siteCount: 1, degradation: 0.8,
    prices: [25, 23, 21, 20, 19, 20, 25, 32, 38, 34, 25, 14, 8, 7, 10, 20, 36, 64, 98, 82, 54, 40, 32, 28],
  },
  {
    chapterId: 'spread-school', title: 'Sunset Sprint', weather: 'Long shadows · 93°F', lesson: 'Power limits how quickly a full battery can meet a narrow peak.', alert: 'BOSS FEED · The peak is shorter, sharper, and wearing expensive sunglasses.', gossip: 'The community pool pump clicked off. Every air conditioner immediately took that personally.', rival: 'Rae Current: “Capacity is not power. Ask me how I learned that.”', siteCount: 3, degradation: 1.0, boss: true,
    prices: [23, 22, 20, 18, 18, 22, 30, 41, 47, 39, 28, 20, 17, 18, 25, 39, 55, 88, 132, 74, 49, 36, 29, 25],
  },
  {
    chapterId: 'fleet-yard', title: 'The Cut', weather: 'Bright heat · 97°F', lesson: 'Choose which homes can earn back their fixed installation cost.', alert: 'FLEET FEED · Eight homes want hardware. Your budget wants a nap.', gossip: 'Permit clerk Dottie approved everything at once. This has never happened and may be a trap.', rival: 'Rae Current: “I brought six batteries.” (She is visibly returning three.)', siteCount: 8, degradation: 1.3, boss: true,
    prices: [28, 26, 24, 23, 24, 29, 39, 52, 59, 48, 35, 24, 19, 21, 30, 48, 74, 111, 128, 96, 64, 45, 35, 30],
  },
  {
    chapterId: 'physics-lab', title: 'Friction Junction', weather: 'Hot wind · 100°F', lesson: 'Small cycles lose to efficiency and wear; wait for the spread that clears both taxes.', alert: 'LAB FEED · Today every electron pays a toll and complains about it.', gossip: 'Aster House named its battery “Doug.” Doug’s warranty lawyer is now present.', rival: 'Rae Current: “I cycle constantly. Motion means profit.” Her accountant has left the chat.', siteCount: 9, degradation: 4.8, boss: true,
    prices: [30, 28, 25, 24, 27, 34, 47, 58, 52, 45, 39, 34, 31, 35, 43, 55, 72, 104, 119, 87, 61, 46, 37, 32],
  },
  {
    chapterId: 'forecast-room', title: 'Clouds on the Wire', weather: 'Cloud shelf · 95°F', lesson: 'The pale band is uncertainty. Lock a plan that can survive the actual line.', alert: 'FORECAST FEED · Meteorology has entered the control room carrying three contradictory charts.', gossip: 'The weather tower says “probably.” Finance has requested a more profitable adverb.', rival: 'Rae Current: “I bet everything on exactly 6pm. What could move a cloud?”', siteCount: 10, degradation: 1.7, forecastRisk: 18,
    prices: [22, 20, 19, 18, 19, 24, 33, 44, 49, 40, 29, 18, 12, 15, 26, 44, 68, 96, 118, 91, 61, 43, 33, 27],
  },
  {
    chapterId: 'forecast-room', title: 'The 6:17 Surprise', weather: 'Storm edge · 98°F', lesson: 'A wide peak window rewards robust timing instead of one perfect forecast hour.', alert: 'BOSS FEED · Forecast confidence: 62%. Office confidence: loud.', gossip: 'Gridville clocks disagree by four minutes. The electrons have declined to comment.', rival: 'Rae Current: “My plan is extremely precise.” That is the problem, Rae.', siteCount: 11, degradation: 1.9, forecastRisk: 28, boss: true,
    prices: [26, 24, 23, 22, 24, 30, 42, 55, 61, 52, 41, 31, 25, 28, 39, 57, 82, 116, 139, 108, 72, 52, 40, 32],
  },
  {
    chapterId: 'ercot-country', title: 'Lines in the Dust', weather: 'Solar blaze · 103°F', lesson: 'Transmission congestion gives West, Central, and East Gridville different prices.', alert: 'ERCOT FEED · One grid, three neighborhood prices, zero patience for traffic jams.', gossip: 'West Gridville has too much noon solar. East Gridville has too many iced-tea compressors.', rival: 'Rae Current: “A spark is a spark.” The transmission line would like a word.', siteCount: 12, degradation: 2.0, forecastRisk: 12, zonal: true,
    prices: [20, 18, 17, 16, 17, 22, 32, 43, 46, 33, 14, -8, -18, -15, -2, 22, 53, 91, 124, 96, 61, 40, 29, 23],
  },
  {
    chapterId: 'ercot-country', title: 'Hold the Line', weather: 'Scarcity watch · 106°F', lesson: 'The Flex Ready event pays for stored energy held through 6pm—selling early forfeits the credit.', alert: 'EVENT FEED · Gridville called a Flex Ready event. Keep charged energy in reserve through 6pm.', gossip: 'The mayor asks everyone to avoid laundry. Tumbleweed House has started seven loads.', rival: 'Rae Current: “I sold at 5pm!” The event payment arrives at 6. Timing is a cruel teacher.', siteCount: 13, degradation: 2.1, forecastRisk: 20, zonal: true, boss: true,
    prices: [24, 22, 21, 20, 21, 27, 38, 51, 58, 49, 33, 12, -6, -10, 3, 29, 62, 104, 148, 121, 80, 55, 41, 31],
    demandResponse: { name: 'Flex Ready', hour: 18, rewardPerStoredKWh: 54, description: 'Earn ₷54 for every kWh still stored after 6pm.' },
  },
  {
    chapterId: 'vpp-final', title: 'The Gridville Stand', weather: 'VPP alert · 107°F', lesson: 'Run the whole neighborhood as one resource: sites, zones, physics, risk, and reserve.', alert: 'FINAL FEED · Scarcity siren active. The whole town is looking at your dispatch desk.', gossip: 'Doug the battery has requested a tiny cape. Request approved.', rival: 'Rae Current: “Winner buys the breakfast tacos.” The control room is now fully motivated.', siteCount: 14, degradation: 2.6, forecastRisk: 30, zonal: true, boss: true,
    prices: [26, 24, 23, 22, 24, 31, 45, 59, 64, 51, 30, 3, -19, -22, -4, 31, 72, 126, 172, 137, 91, 61, 45, 34],
    demandResponse: { name: 'Black Start Reserve', hour: 18, rewardPerStoredKWh: 38, description: 'Hold energy through 6pm to earn reserve sparks before the final sell window.' },
  },
];

function jitter(value: number, random: () => number, spread: number): number {
  return Math.round((value + (random() - 0.5) * spread) * 10) / 10;
}

function zoneForX(x: number): string {
  if (x < 37) return 'West';
  if (x < 72) return 'Central';
  return 'East';
}

function createSites(blueprint: DayBlueprint, dayIndex: number, random: () => number): Site[] {
  return SITE_BLUEPRINTS.slice(0, blueprint.siteCount).map((raw, index) => ({
    id: `home-${index + 1}`,
    name: raw[0], street: raw[1], capacity: raw[2], power: raw[3],
    efficiency: Math.max(0.8, Math.min(0.96, Number(raw[4]) + (index % 3 === 0 ? -0.01 * Math.min(dayIndex, 3) : 0))),
    installCost: Math.max(65, Math.round(Number(raw[5]) * (0.91 + random() * 0.18))),
    x: raw[6], y: raw[7], color: raw[8], zone: zoneForX(raw[6]),
  }));
}

function makeZoneAdjustments(enabled: boolean): Record<string, number[]> | undefined {
  if (!enabled) return undefined;
  return {
    West: Array.from({ length: 24 }, (_, hour) => hour >= 10 && hour <= 15 ? -22 : hour >= 17 && hour <= 19 ? -8 : 0),
    Central: Array(24).fill(0),
    East: Array.from({ length: 24 }, (_, hour) => hour >= 17 && hour <= 20 ? 34 : hour >= 7 && hour <= 9 ? 8 : 0),
  };
}

export function makeDay(matchCode: string, dayIndex: number): DayData {
  const safeIndex = ((dayIndex % CAMPAIGN_DAYS.length) + CAMPAIGN_DAYS.length) % CAMPAIGN_DAYS.length;
  const blueprint = CAMPAIGN_DAYS[safeIndex];
  const chapter = CAMPAIGN_MANIFEST.find((item) => item.id === blueprint.chapterId)!;
  const chapterDays = CAMPAIGN_DAYS.filter((day) => day.chapterId === blueprint.chapterId);
  const dayInRound = chapterDays.findIndex((day) => day === blueprint) + 1;
  const seed = `${matchCode.trim().toUpperCase() || 'OPEN-GRID'}:${safeIndex}`;
  const random = seededRandom(seed);
  const prices = blueprint.prices.map((price) => jitter(price, random, 4));
  const uncertainty = prices.map((_, hour) => blueprint.forecastRisk ? Math.round(5 + blueprint.forecastRisk * Math.sin((hour / 23) * Math.PI) + random() * 6) : 0);
  return {
    id: `day-${safeIndex + 1}`,
    title: blueprint.title,
    weather: blueprint.weather,
    lesson: blueprint.lesson,
    round: chapter.number,
    dayInRound,
    prices,
    uncertainty,
    sites: createSites(blueprint, safeIndex, random),
    degradationCost: blueprint.degradation,
    seed,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    concept: chapter.concept,
    boss: blueprint.boss,
    briefing: { alert: blueprint.alert, gossip: blueprint.gossip, rival: blueprint.rival },
    zonePriceAdjustments: makeZoneAdjustments(Boolean(blueprint.zonal)),
    demandResponse: blueprint.demandResponse,
  };
}

export function realizePrices(day: DayData): number[] {
  if (!day.uncertainty.some(Boolean)) return [...day.prices];
  const random = seededRandom(`${day.seed}:actual`);
  return day.prices.map((forecast, hour) => {
    const triangular = random() + random() - 1;
    return Math.round((forecast + triangular * day.uncertainty[hour]) * 10) / 10;
  });
}

export function buildSequence(matchCode: string): DayData[] {
  return Array.from({ length: CAMPAIGN_DAYS.length }, (_, index) => makeDay(matchCode, index));
}
