export type Action = -1 | 0 | 1;
export type ContentTier = 'free' | 'premium';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface ChapterManifest {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  concept: string;
  fieldGuide: string;
  tier: ContentTier;
  color: string;
}

export interface DemandResponseEvent {
  name: string;
  hour: number;
  rewardPerStoredKWh: number;
  description: string;
}

export interface Site {
  id: string;
  name: string;
  street: string;
  x: number;
  y: number;
  capacity: number;
  power: number;
  efficiency: number;
  installCost: number;
  color: string;
  zone?: string;
}

export interface DayData {
  id: string;
  title: string;
  round: number;
  dayInRound: number;
  weather: string;
  lesson: string;
  prices: number[];
  uncertainty: number[];
  actualPrices?: number[];
  sites: Site[];
  degradationCost: number;
  seed: string;
  chapterId?: string;
  chapterNumber?: number;
  concept?: string;
  boss?: boolean;
  briefing?: {
    alert: string;
    gossip: string;
    rival: string;
  };
  zonePriceAdjustments?: Record<string, number[]>;
  demandResponse?: DemandResponseEvent;
}

export interface SitePlan {
  installed: boolean;
  actions: Action[];
}

export type PlayerPlan = Record<string, SitePlan>;

export interface HourFlow {
  charge: number;
  discharge: number;
  soc: number;
}

export interface SiteEvaluation {
  siteId: string;
  flows: HourFlow[];
  energyRevenue: number;
  reserveRevenue: number;
  energyCost: number;
  degradation: number;
  installCost: number;
  profit: number;
  feasible: boolean;
}

export interface Evaluation {
  sites: SiteEvaluation[];
  revenue: number;
  reserveRevenue: number;
  energyCost: number;
  installCost: number;
  degradation: number;
  profit: number;
  feasible: boolean;
}

export interface OptimalSitePlan {
  siteId: string;
  installed: boolean;
  charge: number[];
  discharge: number[];
  soc: number[];
}

export interface SolverResult {
  status: string;
  objective: number;
  plans: OptimalSitePlan[];
  solveMs: number;
}
