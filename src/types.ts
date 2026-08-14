export type Action = -1 | 0 | 1;

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
}

export interface DayData {
  id: string;
  title: string;
  round: 1 | 2;
  dayInRound: number;
  weather: string;
  lesson: string;
  prices: number[];
  uncertainty: number[];
  actualPrices?: number[];
  sites: Site[];
  degradationCost: number;
  seed: string;
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
  energyCost: number;
  degradation: number;
  installCost: number;
  profit: number;
  feasible: boolean;
}

export interface Evaluation {
  sites: SiteEvaluation[];
  revenue: number;
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
