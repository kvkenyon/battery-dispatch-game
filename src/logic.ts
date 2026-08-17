import type { Action, DayData, DemandResponseEvent, Evaluation, Grade, OptimalSitePlan, PlayerPlan, Site, SiteEvaluation, SolverResult } from './types';

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

export function pricesForSite(day: DayData, site: Site, basePrices = day.prices): number[] {
  const adjustment = site.zone ? day.zonePriceAdjustments?.[site.zone] : undefined;
  return basePrices.map((price, hour) => price + (adjustment?.[hour] ?? 0));
}

export function solverActionAt(plan: OptimalSitePlan | undefined, hour: number): Action {
  const charge = plan?.charge[hour] ?? 0;
  const discharge = plan?.discharge[hour] ?? 0;
  if (Math.max(charge, discharge) < .01) return 0;
  return charge > discharge ? -1 : 1;
}

export function dispatchCallouts(day: DayData, plan: PlayerPlan, solver: SolverResult, settledPrices = day.prices): string[] {
  const callouts: string[] = [];
  const solverOnlySite = day.sites.find((site) => solver.plans.find((candidate) => candidate.siteId === site.id)?.installed && !plan[site.id]?.installed);
  if (solverOnlySite) callouts.push(`HiGHS added ${solverOnlySite.name}. Its capacity and costs cleared the day’s spread test.`);
  const playerOnlySite = day.sites.find((site) => plan[site.id]?.installed && !solver.plans.find((candidate) => candidate.siteId === site.id)?.installed);
  if (playerOnlySite) callouts.push(`You installed ${playerOnlySite.name}; HiGHS sat this one out to protect the fleet’s profit.`);
  for (const site of day.sites) {
    const playerPlan = plan[site.id];
    const solverPlan = solver.plans.find((candidate) => candidate.siteId === site.id);
    if (!playerPlan?.installed || !solverPlan?.installed) continue;
    const prices = pricesForSite(day, site, settledPrices);
    const missedPeak = Array.from({ length: 24 }, (_, hour) => hour)
      .filter((hour) => solverActionAt(solverPlan, hour) === 1 && playerPlan.actions[hour] !== 1)
      .sort((a, b) => prices[b] - prices[a])[0];
    if (missedPeak !== undefined) {
      callouts.push(`${site.name} missed ${hourLabel(missedPeak)} at ₷${prices[missedPeak].toFixed(1)}. HiGHS exported there; save energy for the spike.`);
    }
    const playerCharge = Array.from({ length: 24 }, (_, hour) => hour)
      .filter((hour) => playerPlan.actions[hour] === -1)
      .sort((a, b) => prices[b] - prices[a])[0];
    const solverCharge = Array.from({ length: 24 }, (_, hour) => hour)
      .filter((hour) => solverActionAt(solverPlan, hour) === -1)
      .sort((a, b) => prices[a] - prices[b])[0];
    if (playerCharge !== undefined && solverCharge !== undefined && prices[playerCharge] > prices[solverCharge] + .01) {
      callouts.push(`${site.name} charged at ${hourLabel(playerCharge)} for ₷${prices[playerCharge].toFixed(1)}. HiGHS bought at ${hourLabel(solverCharge)} for ₷${prices[solverCharge].toFixed(1)}.`);
    }
    if (callouts.length >= 3) return callouts.slice(0, 3);
  }
  return callouts.length ? callouts : ['Your dispatch stayed close to the solver’s timing. Try a different site mix to test the next spread.'];
}

export function evaluateSite(site: Site, actions: Action[], prices: number[], degradationCost: number, installed = true, demandResponse?: DemandResponseEvent): SiteEvaluation {
  if (!installed) return { siteId: site.id, flows: HOURS.map(() => ({ charge: 0, discharge: 0, soc: 0 })), energyRevenue: 0, reserveRevenue: 0, energyCost: 0, degradation: 0, installCost: 0, profit: 0, feasible: true };
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
  const reserveRevenue = demandResponse ? (flows[demandResponse.hour]?.soc ?? 0) * demandResponse.rewardPerStoredKWh : 0;
  const installCost = site.installCost;
  const profit = energyRevenue + reserveRevenue - energyCost - degradation - installCost;
  return { siteId: site.id, flows, energyRevenue, reserveRevenue, energyCost, degradation, installCost, profit, feasible: soc <= 0.01 };
}

export function evaluatePlan(day: DayData, plan: PlayerPlan, prices = day.prices): Evaluation {
  const sites = day.sites.map((site) => evaluateSite(site, plan[site.id]?.actions ?? Array(24).fill(0), pricesForSite(day, site, prices), day.degradationCost, plan[site.id]?.installed ?? false, day.demandResponse));
  const totals = sites.reduce((sum, site) => ({
    revenue: sum.revenue + site.energyRevenue,
    reserveRevenue: sum.reserveRevenue + site.reserveRevenue,
    energyCost: sum.energyCost + site.energyCost,
    installCost: sum.installCost + site.installCost,
    degradation: sum.degradation + site.degradation,
    profit: sum.profit + site.profit,
  }), { revenue: 0, reserveRevenue: 0, energyCost: 0, installCost: 0, degradation: 0, profit: 0 });
  return { ...totals, sites, feasible: sites.every((site) => site.feasible) };
}

export function performancePercent(player: number, optimal: number): number {
  if (optimal <= 0) return player >= optimal ? 100 : 0;
  return Math.max(0, Math.round((player / optimal) * 100));
}

export function gradeForPercent(percent: number): Grade {
  if (percent >= 98) return 'S';
  if (percent >= 90) return 'A';
  if (percent >= 75) return 'B';
  if (percent >= 60) return 'C';
  return 'D';
}

export function medalForGrade(grade: Grade): 'gold' | 'silver' | 'bronze' | 'none' {
  if (grade === 'S') return 'gold';
  if (grade === 'A') return 'silver';
  if (grade === 'B') return 'bronze';
  return 'none';
}

export function dispatchSuggestion(day: DayData, plan: PlayerPlan, solver: SolverResult): string {
  const installed = day.sites.filter((site) => plan[site.id]?.installed);
  const evaluation = evaluatePlan(day, plan);
  const peakHour = day.prices.indexOf(Math.max(...day.prices));
  const underfilled = installed.find((site) => {
    const result = evaluation.sites.find((entry) => entry.siteId === site.id);
    const fullest = Math.max(0, ...(result?.flows.slice(0, peakHour + 1).map((flow) => flow.soc) ?? []));
    return fullest < site.capacity - 0.25;
  });
  if (underfilled) {
    const result = evaluation.sites.find((entry) => entry.siteId === underfilled.id)!;
    const fullest = Math.max(...result.flows.map((flow) => flow.soc));
    return `${underfilled.name} reached only ${fullest.toFixed(1)} of ${underfilled.capacity} kWh before the peak. Paint one more cheap charge hour; it stops automatically at full.`;
  }
  const sleeper = installed.find((site) => plan[site.id].actions[peakHour] !== 1);
  if (sleeper) return `${sleeper.name} slept through the ${hourLabel(peakHour)} spike. Try saving a little charge for it.`;
  const missed = solver.plans.find((site) => site.installed && !plan[site.siteId]?.installed);
  if (missed) {
    const site = day.sites.find((candidate) => candidate.id === missed.siteId);
    if (site) return `The solver recruited ${site.name}. Its capacity-to-install-cost ratio earned the call-up.`;
  }
  const costlyCharge = installed.flatMap((site) => plan[site.id].actions.map((action, hour) => ({ site, action, hour }))).find(({ action, hour }) => action === -1 && day.prices[hour] > day.prices.reduce((sum, price) => sum + price, 0) / 24);
  if (costlyCharge) return `${costlyCharge.site.name} bought energy at ${hourLabel(costlyCharge.hour)} above the day's average. Hunt for a cheaper valley.`;
  return 'Your timing was sharp. Next run, test whether one fewer installation preserves the same spread profit.';
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
