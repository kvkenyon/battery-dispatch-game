import highsLoader from 'highs';
import wasmUrl from 'highs/runtime?url';
import type { DayData, OptimalSitePlan, SolverResult } from './types';

type HighsColumn = { Primal: number };
type HighsSolution = { Status: string; ObjectiveValue: number; Columns: Record<string, HighsColumn> };

function term(coefficient: number, variable: string): string {
  const sign = coefficient >= 0 ? '+' : '-';
  return `${sign} ${Math.abs(coefficient).toFixed(6)} ${variable}`;
}

export function buildLpModel(day: DayData): string {
  const objective: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  day.sites.forEach((site, j) => {
    const x = `x_${j}`;
    binaries.push(x);
    objective.push(term(-site.installCost, x));
    const eta = Math.sqrt(site.efficiency);
    for (let hour = 0; hour < 24; hour += 1) {
      const c = `c_${j}_${hour}`;
      const d = `d_${j}_${hour}`;
      const s = `s_${j}_${hour}`;
      objective.push(term(-(day.prices[hour] + day.degradationCost), c));
      objective.push(term(day.prices[hour] - day.degradationCost, d));
      constraints.push(`charge_link_${j}_${hour}: ${c} - ${site.power} ${x} <= 0`);
      constraints.push(`discharge_link_${j}_${hour}: ${d} - ${site.power} ${x} <= 0`);
      constraints.push(`storage_link_${j}_${hour}: ${s} - ${site.capacity} ${x} <= 0`);
      if (hour === 0) {
        constraints.push(`balance_${j}_${hour}: ${s} - ${eta.toFixed(8)} ${c} + ${(1 / eta).toFixed(8)} ${d} = 0`);
      } else {
        constraints.push(`balance_${j}_${hour}: ${s} - s_${j}_${hour - 1} - ${eta.toFixed(8)} ${c} + ${(1 / eta).toFixed(8)} ${d} = 0`);
      }
      bounds.push(`0 <= ${c}`, `0 <= ${d}`, `0 <= ${s}`);
    }
    constraints.push(`finish_empty_${j}: s_${j}_23 = 0`);
  });
  return [
    'Maximize', ` profit: ${objective.join(' ')}`,
    'Subject To', ...constraints,
    'Bounds', ...bounds,
    'Binary', ...binaries,
    'End',
  ].join('\n');
}

let browserHighs: ReturnType<typeof highsLoader> | undefined;

async function loadHighs() {
  if (typeof window === 'undefined') return highsLoader();
  browserHighs ??= highsLoader({ locateFile: () => wasmUrl });
  return browserHighs;
}

export async function solveDay(day: DayData): Promise<SolverResult> {
  const started = performance.now();
  const highs = await loadHighs();
  const solution = highs.solve(buildLpModel(day), { output_flag: false, time_limit: 4 }) as HighsSolution;
  if (solution.Status !== 'Optimal') throw new Error(`HiGHS returned ${solution.Status}`);
  const plans: OptimalSitePlan[] = day.sites.map((site, j) => ({
    siteId: site.id,
    installed: (solution.Columns[`x_${j}`]?.Primal ?? 0) > 0.5,
    charge: Array.from({ length: 24 }, (_, hour) => solution.Columns[`c_${j}_${hour}`]?.Primal ?? 0),
    discharge: Array.from({ length: 24 }, (_, hour) => solution.Columns[`d_${j}_${hour}`]?.Primal ?? 0),
    soc: Array.from({ length: 24 }, (_, hour) => solution.Columns[`s_${j}_${hour}`]?.Primal ?? 0),
  }));
  return { status: solution.Status, objective: solution.ObjectiveValue, plans, solveMs: performance.now() - started };
}

export function evaluateOptimalOnPrices(day: DayData, result: SolverResult, prices: number[]): number {
  return result.plans.reduce((total, plan, j) => {
    if (!plan.installed) return total;
    const energy = plan.charge.reduce((sum, charge, hour) => sum - charge * prices[hour] - charge * day.degradationCost + plan.discharge[hour] * prices[hour] - plan.discharge[hour] * day.degradationCost, 0);
    return total + energy - day.sites[j].installCost;
  }, 0);
}
