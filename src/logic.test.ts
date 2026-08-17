import { describe, expect, it } from 'vitest';
import { buildSequence, CAMPAIGN_MANIFEST, FOUNDERS_PREVIEW, makeDay, realizePrices, seededRandom } from './data';
import { dispatchCallouts, emptyPlan, evaluatePlan, evaluateSite, gradeForPercent, makeSmartPreset, medalForGrade, performancePercent, pricesForSite, solverActionAt } from './logic';
import { buildLpModel, evaluateOptimalOnPrices, solveDay } from './solver';
import type { DayData, SolverResult } from './types';

describe('seeded game data', () => {
  it('repeats the same random stream and day', () => {
    const a = seededRandom('TEXAS-42');
    const b = seededRandom('TEXAS-42');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(makeDay('class-a', 4)).toEqual(makeDay('class-a', 4));
    expect(realizePrices(makeDay('class-a', 4))).toEqual(realizePrices(makeDay('class-a', 4)));
  });

  it('builds the complete six-chapter founders-preview campaign', () => {
    const sequence = buildSequence('TEXAS-42');
    expect(sequence).toHaveLength(9);
    expect(new Set(sequence.map((day) => day.chapterId)).size).toBe(6);
    expect(CAMPAIGN_MANIFEST.map((chapter) => chapter.tier)).toEqual(['free', 'free', 'free', 'premium', 'premium', 'premium']);
    expect(FOUNDERS_PREVIEW).toBe(true);
  });
});

describe('dispatch accounting', () => {
  const site = { id: 'tiny', name: 'Tiny', street: '1 Test', x: 0, y: 0, capacity: 4, power: 4, efficiency: 1, installCost: 10, color: '#000' };
  it('accounts for buy, sell, installation, and degradation', () => {
    const actions = Array(24).fill(0); actions[0] = -1; actions[1] = 1;
    const result = evaluateSite(site, actions, [2, 10, ...Array(22).fill(0)], 1, true);
    expect(result.energyCost).toBe(8);
    expect(result.energyRevenue).toBe(40);
    expect(result.degradation).toBe(8);
    expect(result.profit).toBe(14);
    expect(result.feasible).toBe(true);
  });

  it('flags energy left at the end and presets return to empty', () => {
    const actions = Array(24).fill(0); actions[23] = -1;
    expect(evaluateSite(site, actions, Array(24).fill(5), 0, true).feasible).toBe(false);
    const day = makeDay('preset', 0);
    const preset = makeSmartPreset(day.sites[0], day.prices);
    expect(evaluateSite(day.sites[0], preset, day.prices, day.degradationCost, true).feasible).toBe(true);
  });

  it('ignores schedules at homes without an installation', () => {
    const day = makeDay('empty', 0);
    expect(evaluatePlan(day, emptyPlan(day)).profit).toBe(0);
  });

  it('settles zonal prices and a stored-energy demand response reward', () => {
    const day = makeDay('zones', 7);
    const site = day.sites.find((candidate) => candidate.zone === 'East')!;
    const actions = Array(24).fill(0); actions[12] = -1; actions[19] = 1;
    const plan = emptyPlan(day); plan[site.id] = { installed: true, actions };
    const sitePrices = pricesForSite(day, site);
    expect(sitePrices[18]).toBeGreaterThan(day.prices[18]);
    expect(evaluatePlan(day, plan).sites.find((entry) => entry.siteId === site.id)!.reserveRevenue).toBeGreaterThan(0);
  });
});

describe('campaign grading', () => {
  it('assigns stable performance grades and medals at the published thresholds', () => {
    expect(performancePercent(90, 100)).toBe(90);
    expect(performancePercent(-5, 100)).toBe(0);
    expect(gradeForPercent(98)).toBe('S');
    expect(gradeForPercent(90)).toBe('A');
    expect(gradeForPercent(75)).toBe('B');
    expect(gradeForPercent(60)).toBe('C');
    expect(gradeForPercent(59)).toBe('D');
    expect(medalForGrade('S')).toBe('gold');
    expect(medalForGrade('A')).toBe('silver');
    expect(medalForGrade('B')).toBe('bronze');
    expect(medalForGrade('C')).toBe('none');
  });
});

describe('solver showdown coaching', () => {
  it('turns the solver flow into actions and names specific timing mistakes', () => {
    const day = makeDay('showdown', 0);
    const site = day.sites[0];
    const plan = emptyPlan(day);
    plan[site.id] = { installed: true, actions: Array(24).fill(0) };
    plan[site.id].actions[16] = -1;
    plan[site.id].actions[17] = 1;
    const solver: SolverResult = {
      status: 'Optimal', objective: 0, solveMs: 0,
      plans: [{
        siteId: site.id, installed: true,
        charge: Array.from({ length: 24 }, (_, hour) => hour === 12 ? site.power : 0),
        discharge: Array.from({ length: 24 }, (_, hour) => hour === 18 ? site.power : 0),
        soc: Array(24).fill(0),
      }],
    };
    expect(solverActionAt(solver.plans[0], 12)).toBe(-1);
    expect(solverActionAt(solver.plans[0], 18)).toBe(1);
    const callouts = dispatchCallouts(day, plan, solver);
    expect(callouts).toHaveLength(2);
    expect(callouts[0]).toContain(`missed 6p at ₷${day.prices[18].toFixed(1)}`);
    expect(callouts[1]).toContain(`charged at 4p for ₷${day.prices[16].toFixed(1)}`);
    expect(callouts[1]).toContain(`12p for ₷${day.prices[12].toFixed(1)}`);
  });

  it('calls out a solver-only installation instead of calling disjoint fleets similar', () => {
    const day = makeDay('site-choice', 1);
    const plan = emptyPlan(day);
    plan[day.sites[0].id].installed = true;
    const solver: SolverResult = {
      status: 'Optimal', objective: 0, solveMs: 0,
      plans: [{ siteId: day.sites[1].id, installed: true, charge: Array(24).fill(0), discharge: Array(24).fill(0), soc: Array(24).fill(0) }],
    };
    expect(dispatchCallouts(day, plan, solver)[0]).toContain(`HiGHS added ${day.sites[1].name}`);
  });
});

describe('HiGHS model', () => {
  const tinyDay: DayData = {
    id: 'tiny', title: 'Tiny', round: 1, dayInRound: 1, weather: '', lesson: '', seed: 'tiny', uncertainty: Array(24).fill(0), degradationCost: 0,
    prices: [2, 10, ...Array(22).fill(2)],
    sites: [{ id: 'tiny', name: 'Tiny', street: '1 Test', x: 0, y: 0, capacity: 4, power: 4, efficiency: 1, installCost: 10, color: '#000' }],
  };

  it('constructs install links, SOC balances, and binary decisions', () => {
    const model = buildLpModel(tinyDay);
    expect(model).toContain('charge_link_0_0: c_0_0 - 4 x_0 <= 0');
    expect(model).toContain('finish_empty_0: s_0_23 = 0');
    expect(model).toContain('Binary\nx_0');
  });

  it('matches the hand-computed tiny optimum', async () => {
    const solution = await solveDay(tinyDay);
    expect(solution.status).toBe('Optimal');
    expect(solution.objective).toBeCloseTo(22, 5);
    expect(solution.plans[0].installed).toBe(true);
  });

  it('keeps demand-response reward and zonal prices in the LP objective', () => {
    const eventDay = makeDay('lp-event', 7);
    const model = buildLpModel(eventDay);
    expect(model).toContain('s_0_18');
    expect(model).toContain('54.000000 s_0_18');
    expect(model).toContain('d_10_18');
  });

  it('settles the zonal demand-response optimum with the same accounting as the LP objective', async () => {
    const eventDay = makeDay('lp-event', 7);
    const solution = await solveDay(eventDay);
    expect(Math.abs(evaluateOptimalOnPrices(eventDay, solution, eventDay.prices) - solution.objective)).toBeLessThan(0.01);
  });
});
