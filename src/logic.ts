import type { Action, DayData, Evaluation, PlayerPlan, Site, SiteEvaluation } from './types';

export const HOURS = Array.from({ length: 24 }, (_, index) => index);

export function emptyPlan(day: DayData): PlayerPlan {
  return Object.fromEntries(day.sites.map((site) => [site.id, { installed: false, actions: Array(24).fill(0) as Action[] }]));
}

export function makeSmartPreset(site: Site, prices: number[]): Action[] {
  const actions = Array(24).fill(0) as Action[];
  let bestPeak = 1;
  let bestSpread = -Infinity;
  let minBefore = prices[0];
  for (let hour = 1; hour < 24; hour += 1) {
    if (prices[hour] - minBefore > bestSpread) {
      bestSpread = prices[hour] - minBefore;
      bestPeak = hour;
    }
    minBefore = Math.min(minBefore, prices[hour]);
  }
  const eta = Math.sqrt(site.efficiency);
  const chargeHours = Math.ceil(site.capacity / (site.power * eta));
  const dischargeHours = Math.ceil((site.capacity * eta) / site.power);
  [...Array(bestPeak).keys()]
    .sort((a, b) => prices[a] - prices[b])
    .slice(0, chargeHours)
    .forEach((hour) => { actions[hour] = -1; });
  Array.from({ length: 24 - bestPeak }, (_, i) => i + bestPeak)
    .sort((a, b) => prices[b] - prices[a])
    .slice(0, dischargeHours)
    .forEach((hour) => { actions[hour] = 1; });
  return actions;
}

export function evaluateSite(site: Site, actions: Action[], prices: number[], degradationCost: number, installed = true): SiteEvaluation {
  if (!installed) return { siteId: site.id, flows: HOURS.map(() => ({ charge: 0, discharge: 0, soc: 0 })), energyRevenue: 0, energyCost: 0, degradation: 0, installCost: 0, profit: 0, feasible: true };
  const eta = Math.sqrt(site.efficiency);
  let soc = 0;
  let energyRevenue = 0;
  let energyCost = 0;
  let degradation = 0;
  const flows = HOURS.map((hour) => {
    let charge = 0;
    let discharge = 0;
    if (actions[hour] === -1) {
      charge = Math.min(site.power, Math.max(0, (site.capacity - soc) / eta));
      soc += charge * eta;
    } else if (actions[hour] === 1) {
      discharge = Math.min(site.power, Math.max(0, soc * eta));
      soc -= discharge / eta;
    }
    if (Math.abs(soc) < 1e-9) soc = 0;
    energyCost += charge * prices[hour];
    energyRevenue += discharge * prices[hour];
    degradation += (charge + discharge) * degradationCost;
    return { charge, discharge, soc };
  });
  const installCost = site.installCost;
  const profit = energyRevenue - energyCost - degradation - installCost;
  return { siteId: site.id, flows, energyRevenue, energyCost, degradation, installCost, profit, feasible: soc <= 0.01 };
}

export function evaluatePlan(day: DayData, plan: PlayerPlan, prices = day.prices): Evaluation {
  const sites = day.sites.map((site) => evaluateSite(site, plan[site.id]?.actions ?? Array(24).fill(0), prices, day.degradationCost, plan[site.id]?.installed ?? false));
  const totals = sites.reduce((sum, site) => ({
    revenue: sum.revenue + site.energyRevenue,
    energyCost: sum.energyCost + site.energyCost,
    installCost: sum.installCost + site.installCost,
    degradation: sum.degradation + site.degradation,
    profit: sum.profit + site.profit,
  }), { revenue: 0, energyCost: 0, installCost: 0, degradation: 0, profit: 0 });
  return { ...totals, sites, feasible: sites.every((site) => site.feasible) };
}

export function formatSpark(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  return `${sign}₷${Math.abs(rounded).toLocaleString()}`;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}
