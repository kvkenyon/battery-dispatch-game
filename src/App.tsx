import { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BatteryCharging, BookOpen, Check, ChevronRight, CircleDollarSign, CloudSun, Download, Gauge, House, Info, Lightbulb, LoaderCircle, MapPin, RotateCcw, Sparkles, Trophy, Users, X } from 'lucide-react';
import { buildSequence, realizePrices } from './data';
import { emptyPlan, evaluatePlan, formatSpark, hourLabel, makeSmartPreset } from './logic';
import { evaluateOptimalOnPrices, solveDay } from './solver';
import type { Action, DayData, PlayerPlan, SolverResult } from './types';

type Screen = 'welcome' | 'game' | 'result' | 'learn' | 'summary';
type Score = { day: DayData; player: number; optimal: number };

const ACTION_META: Record<Action, { label: string; icon: typeof ArrowDown }> = {
  [-1]: { label: 'Charge', icon: ArrowDown },
  [0]: { label: 'Idle', icon: X },
  [1]: { label: 'Discharge', icon: ArrowUp },
};

function PriceChart({ forecast, actual, uncertainty, compact = false }: { forecast: number[]; actual?: number[]; uncertainty?: number[]; compact?: boolean }) {
  const width = 720;
  const height = compact ? 145 : 205;
  const pad = { top: 18, right: 15, bottom: 28, left: 42 };
  const all = [...forecast, ...(actual ?? []), ...(uncertainty ? forecast.map((p, i) => p + uncertainty[i]) : []), ...(uncertainty ? forecast.map((p, i) => p - uncertainty[i]) : [])];
  const min = Math.min(-5, ...all);
  const max = Math.max(10, ...all);
  const x = (i: number) => pad.left + (i / 23) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom);
  const line = (values: number[]) => values.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const band = uncertainty ? `${forecast.map((value, i) => `${i ? 'L' : 'M'}${x(i)},${y(value + uncertainty[i])}`).join(' ')} ${[...forecast].reverse().map((value, reverseIndex) => { const i = 23 - reverseIndex; return `L${x(i)},${y(value - uncertainty[i])}`; }).join(' ')} Z` : '';
  return <div className="chart-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly grid price chart">
      <defs><linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9ff70" stopOpacity=".28"/><stop offset="1" stopColor="#c9ff70" stopOpacity="0"/></linearGradient></defs>
      {[min, (min + max) / 2, max].map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="gridline"/><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="axis-label">{Math.round(tick)}</text></g>)}
      {min < 0 && <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="zero-line"/>}
      {band && <path d={band} className="error-band"/>}
      <path d={`${line(forecast)} L${x(23)},${y(min)} L${x(0)},${y(min)} Z`} fill="url(#price-fill)"/>
      <path d={line(forecast)} className="forecast-line"/>
      {actual && <path d={line(actual)} className="actual-line"/>}
      {[0, 6, 12, 18, 23].map((hour) => <text key={hour} x={x(hour)} y={height - 7} textAnchor={hour === 0 ? 'start' : hour === 23 ? 'end' : 'middle'} className="axis-label">{hourLabel(hour)}</text>)}
    </svg>
    <div className="chart-legend"><span><i className="legend-dot forecast"/>Forecast</span>{actual && <span><i className="legend-dot actual"/>Actual</span>}{uncertainty?.some(Boolean) && <span><i className="legend-band"/>Possible range</span>}<b>₷ / kWh</b></div>
  </div>;
}

function NeighborhoodMap({ day, plan, selectedId, onSelect, onToggle }: { day: DayData; plan: PlayerPlan; selectedId?: string; onSelect: (id: string) => void; onToggle: (id: string) => void }) {
  return <div className="map-shell">
    <svg className="map" viewBox="0 0 104 106" role="img" aria-label="Candidate home map">
      <defs><pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".25" fill="#d5d4c7"/></pattern></defs>
      <rect width="104" height="106" rx="3" fill="#f4f1e5"/><rect width="104" height="106" rx="3" fill="url(#dots)"/>
      <path className="road" d="M-4 43 C18 39 26 49 46 44 S77 34 108 42 M-4 82 C24 75 41 84 59 79 S88 67 108 73 M43 -4 C38 19 48 28 44 49 S36 78 43 110"/>
      <path className="road-center" d="M-4 43 C18 39 26 49 46 44 S77 34 108 42 M-4 82 C24 75 41 84 59 79 S88 67 108 73 M43 -4 C38 19 48 28 44 49 S36 78 43 110"/>
      <path d="M2 7H36V34H2zM51 5h49v25H51zM4 53h29v20H4zM51 51h49v14H51zM2 89h32v13H2zM50 87h50v15H50z" className="block"/>
      {day.sites.map((site) => {
        const installed = plan[site.id]?.installed;
        const selected = selectedId === site.id;
        return <g key={site.id} className={`home-marker ${installed ? 'installed' : ''} ${selected ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`${site.name}, ${installed ? 'battery installed' : 'candidate site'}`} onClick={() => { onSelect(site.id); onToggle(site.id); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(site.id); onToggle(site.id); } }}>
          <circle cx={site.x} cy={site.y} r={selected ? 5.7 : 5} className="marker-halo"/>
          <path d={`M${site.x - 3.8} ${site.y} L${site.x} ${site.y - 3.1} L${site.x + 3.8} ${site.y} V${site.y + 3.6} H${site.x - 3.8}Z`} fill={installed ? site.color : '#fffdf4'} className="house-shape"/>
          {installed && <path d={`M${site.x - 1.2} ${site.y + .2}h2.4v2.2h-2.4z`} className="battery-window"/>}
        </g>;
      })}
      <text x="6" y="101" className="map-label">GRIDVILLE · TRAVIS PRAIRIE DISTRICT</text>
    </svg>
    <div className="map-key"><span><i className="key-house"/>Candidate home</span><span><i className="key-house active"/>Battery placed</span></div>
  </div>;
}

function SiteEditor({ day, siteId, plan, onPlan }: { day: DayData; siteId: string; plan: PlayerPlan; onPlan: (plan: PlayerPlan) => void }) {
  const site = day.sites.find((candidate) => candidate.id === siteId)!;
  const sitePlan = plan[site.id];
  const setInstalled = (installed: boolean) => onPlan({ ...plan, [site.id]: { installed, actions: installed && !sitePlan.actions.some((a) => a !== 0) ? makeSmartPreset(site, day.prices) : sitePlan.actions } });
  const setAction = (hour: number, action: Action) => {
    const actions = [...sitePlan.actions]; actions[hour] = action;
    onPlan({ ...plan, [site.id]: { ...sitePlan, actions } });
  };
  const siteEval = evaluatePlan(day, plan).sites.find((entry) => entry.siteId === site.id)!;
  return <section className="site-editor card">
    <div className="site-heading">
      <div><span className="eyebrow">SELECTED SITE</span><h2>{site.name}</h2><p><MapPin size={14}/>{site.street}</p></div>
      <button className={`install-toggle ${sitePlan.installed ? 'on' : ''}`} onClick={() => setInstalled(!sitePlan.installed)}>{sitePlan.installed ? <><Check size={16}/> Installed</> : <><BatteryCharging size={16}/> Place battery</>}</button>
    </div>
    <div className="spec-row"><span><b>{site.capacity}</b> kWh capacity</span><span><b>{site.power}</b> kW power</span><span><b>{Math.round(site.efficiency * 100)}%</b> round trip</span><span><b>{formatSpark(site.installCost)}</b> install</span></div>
    {sitePlan.installed ? <>
      <div className="schedule-title"><div><h3>Paint the dispatch</h3><p>Click a cell to cycle charge → discharge → idle.</p></div><div className="schedule-actions"><button onClick={() => onPlan({ ...plan, [site.id]: { ...sitePlan, actions: makeSmartPreset(site, day.prices) } })}><Sparkles size={14}/> Buy low / sell high</button><button aria-label="Clear schedule" onClick={() => onPlan({ ...plan, [site.id]: { ...sitePlan, actions: Array(24).fill(0) as Action[] } })}><RotateCcw size={14}/></button></div></div>
      <div className="schedule-grid">{sitePlan.actions.map((action, hour) => { const meta = ACTION_META[action]; const Icon = meta.icon; return <button key={hour} className={`schedule-cell action-${action}`} aria-label={`${hourLabel(hour)}: ${meta.label}`} title={`${hourLabel(hour)} · ${meta.label}`} onClick={() => setAction(hour, action === 0 ? -1 : action === -1 ? 1 : 0)}><span>{hourLabel(hour)}</span><Icon size={15}/><small>{Math.round(siteEval.flows[hour].soc)}</small></button>; })}</div>
      <div className="schedule-key"><span className="charge"><ArrowDown size={13}/> Charge</span><span className="idle"><X size={13}/> Idle</span><span className="discharge"><ArrowUp size={13}/> Discharge</span><span className="soc-key">number = ending state of charge</span></div>
      {!siteEval.feasible && <div className="warning"><Info size={16}/> End-of-day charge must return to zero. Add a discharge hour after your final charge.</div>}
    </> : <div className="editor-empty"><BatteryCharging size={30}/><div><b>No battery here yet</b><p>Place one to unlock its 24-hour dispatch schedule.</p></div></div>}
  </section>;
}

function GameScreen({ day, plan, setPlan, selectedId, setSelectedId, onDone, solving }: { day: DayData; plan: PlayerPlan; setPlan: (p: PlayerPlan) => void; selectedId: string; setSelectedId: (id: string) => void; onDone: () => void; solving: boolean }) {
  const evaluation = evaluatePlan(day, plan);
  const installedCount = Object.values(plan).filter((site) => site.installed).length;
  const toggle = (id: string) => {
    const site = day.sites.find((candidate) => candidate.id === id)!;
    const current = plan[id];
    setPlan({ ...plan, [id]: { installed: !current.installed, actions: !current.installed && !current.actions.some((a) => a !== 0) ? makeSmartPreset(site, day.prices) : current.actions } });
  };
  return <>
    <main className="game-main">
      <section className="day-header">
        <div><div className="round-chip">ROUND {day.round} · DAY {day.dayInRound} OF 3</div><h1>{day.title}</h1><p>{day.lesson}</p></div>
        <div className="weather"><CloudSun size={20}/><span>{day.weather}</span></div>
      </section>
      {day.round === 2 && <div className="uncertainty-note"><CloudSun size={18}/><div><b>Forecast round</b><span>The pale ribbon is the possible price range. Actual prices appear only after you lock your plan.</span></div></div>}
      <div className="game-grid">
        <section className="card map-card"><div className="card-title"><div><span className="eyebrow">STEP 1</span><h2>Choose homes</h2></div><span className="count-pill">{installedCount} placed</span></div><NeighborhoodMap day={day} plan={plan} selectedId={selectedId} onSelect={setSelectedId} onToggle={toggle}/></section>
        <section className="card prices-card"><div className="card-title"><div><span className="eyebrow">TODAY’S MARKET</span><h2>{day.round === 1 ? 'Day-ahead prices' : 'Price forecast'}</h2></div><Gauge size={21}/></div><PriceChart forecast={day.prices} uncertainty={day.round === 2 ? day.uncertainty : undefined}/></section>
      </div>
      <SiteEditor day={day} siteId={selectedId} plan={plan} onPlan={setPlan}/>
    </main>
    <footer className="profit-bar">
      <div className="profit-brand"><CircleDollarSign/><div><small>LIVE PLAN</small><b className={evaluation.profit >= 0 ? 'positive' : 'negative'}>{formatSpark(evaluation.profit)}</b></div></div>
      <div className="profit-parts"><span><small>Energy sales</small><b>+{formatSpark(evaluation.revenue)}</b></span><span><small>Energy purchases</small><b>−{formatSpark(evaluation.energyCost)}</b></span><span><small>Installations</small><b>−{formatSpark(evaluation.installCost)}</b></span><span><small>Battery wear</small><b>−{formatSpark(evaluation.degradation)}</b></span></div>
      <button className="done-button" disabled={!installedCount || !evaluation.feasible || solving} onClick={onDone}>{solving ? <><LoaderCircle className="spin"/> Solving…</> : <>Lock plan <ArrowRight/></>}</button>
    </footer>
  </>;
}

function DispatchStrip({ charge, discharge }: { charge: number[]; discharge: number[] }) {
  const max = Math.max(1, ...charge, ...discharge);
  return <div className="dispatch-strip" aria-label="Optimal hourly dispatch">{charge.map((value, hour) => <div key={hour} title={`${hourLabel(hour)} · ${value > .01 ? `charge ${value.toFixed(1)}` : discharge[hour] > .01 ? `discharge ${discharge[hour].toFixed(1)}` : 'idle'} kWh`} className={value > .01 ? 'charge' : discharge[hour] > .01 ? 'discharge' : 'idle'} style={{ '--level': `${Math.max(value, discharge[hour]) / max}` } as React.CSSProperties}/>)}</div>;
}

function ResultScreen({ day, plan, solver, actual, onNext, finalDay, championship }: { day: DayData; plan: PlayerPlan; solver: SolverResult; actual: number[]; onNext: () => void; finalDay: boolean; championship: boolean }) {
  const player = evaluatePlan(day, plan, actual);
  const optimum = evaluateOptimalOnPrices(day, solver, actual);
  const forecastOptimum = solver.objective;
  const gap = optimum === 0 ? 100 : Math.round((player.profit / optimum) * 100);
  const installed = solver.plans.filter((site) => site.installed);
  return <main className="result-main">
    <section className="result-hero">
      <div className="result-kicker"><Sparkles size={16}/> HiGHS found the benchmark in {(solver.solveMs / 1000).toFixed(2)} seconds</div>
      <h1>{gap >= 95 ? 'That was electric.' : gap >= 70 ? 'A strong dispatch.' : 'The solver found another gear.'}</h1>
      <p>{day.round === 1 ? 'Your intuition, measured against the true mixed-integer optimum.' : 'Both locked plans were designed from the forecast, then settled against the same actual market.'}</p>
      <div className="score-compare">
        <div className="score-card player"><span>YOUR PROFIT</span><strong>{formatSpark(player.profit)}</strong><small>{Object.values(plan).filter((p) => p.installed).length} homes installed</small></div>
        <div className="gap-medallion"><b>{gap}%</b><span>of benchmark</span></div>
        <div className="score-card solver"><span>{day.round === 1 ? 'TRUE OPTIMUM' : 'FORECAST BENCHMARK'}</span><strong>{formatSpark(optimum)}</strong><small>{installed.length} homes installed{day.round === 2 ? ` · ${formatSpark(forecastOptimum)} forecast` : ''}</small></div>
      </div>
    </section>
    {day.round === 2 && <section className="card result-chart"><div className="card-title"><div><span className="eyebrow">FORECAST CHECK</span><h2>What the market actually did</h2></div></div><PriceChart forecast={day.prices} actual={actual}/></section>}
    {championship ? <section className="championship-lock card"><Trophy/><div><span className="eyebrow">CHAMPIONSHIP MODE</span><h2>Benchmark plan sealed</h2><p>Your score is settled, but site choices and dispatch are hidden so the next player gets a fair run.</p></div></section> : <section className="solution-card card"><div className="solution-head"><div><span className="eyebrow">SOLVER’S PLAN</span><h2>{installed.length} batteries made the cut</h2><p>Bars below show when the optimized fleet charged and discharged.</p></div><div className="strip-legend"><span className="charge">Charge</span><span className="discharge">Discharge</span></div></div>
      <div className="solution-list">{installed.map((optimal) => { const site = day.sites.find((s) => s.id === optimal.siteId)!; return <div className="solution-row" key={site.id}><div className="solution-site"><i style={{ background: site.color }}/><div><b>{site.name}</b><small>{site.capacity} kWh · {site.power} kW · {formatSpark(site.installCost)}</small></div></div><DispatchStrip charge={optimal.charge} discharge={optimal.discharge}/></div>; })}</div>
    </section>}
    <div className="takeaway"><Lightbulb/><div><b>Dispatch note</b><p>{gap >= 95 ? 'Your site choices and timing nearly matched a globally optimized plan.' : 'The solver prices every extra unit of capacity against installation cost, efficiency loss, and every hourly spread at once.'}</p></div><button className="primary" onClick={onNext}>{finalDay ? <>See match summary <Trophy/></> : <>Next day <ChevronRight/></>}</button></div>
  </main>;
}

function Welcome({ code, setCode, championship, setChampionship, onStart }: { code: string; setCode: (code: string) => void; championship: boolean; setChampionship: (value: boolean) => void; onStart: () => void }) {
  return <main className="welcome">
    <section className="welcome-copy"><div className="town-badge"><BatteryCharging size={17}/> GRIDVILLE VIRTUAL POWER CO.</div><h1>Make the grid<br/><em>work smarter.</em></h1><p>You run a neighborhood battery startup in Gridville, Texas. Pick homes. Plan each hour. Then see how your instinct stacks up against a real optimization solver.</p><div className="welcome-actions"><button className="primary large" onClick={onStart}>Start dispatching <ArrowRight/></button><span>6 days · 2 rounds · No account</span></div></section>
    <section className="welcome-panel">
      <div className="sun-disc"/><div className="skyline"><i/><i/><i/><i/><i/></div>
      <div className="match-card"><div className="match-title"><Users/><div><b>Class match</b><span>Use one code so everyone gets the same days.</span></div></div><label htmlFor="match-code">MATCH CODE</label><input id="match-code" value={code} maxLength={18} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}/><small>Saved only in this browser</small><button className={`championship-toggle ${championship ? 'on' : ''}`} onClick={() => setChampionship(!championship)} role="switch" aria-checked={championship}><span>{championship ? <Check/> : null}</span><div><b>Championship mode</b><small>Hide the solver’s plan between players.</small></div></button></div>
      <div className="how-stack"><article><span>1</span><div><b>Place</b><small>Choose the best candidate homes.</small></div></article><article><span>2</span><div><b>Dispatch</b><small>Buy low, hold, and sell high.</small></div></article><article><span>3</span><div><b>Compare</b><small>Meet the mathematical optimum.</small></div></article></div>
    </section>
  </main>;
}

function Learn({ day }: { day: DayData }) {
  const download = () => {
    const payload = { currency: 'sparks (₷)', startSocKWh: 0, endSocKWh: 0, degradationCostPerKWh: day.degradationCost, prices: day.prices, uncertainty: day.uncertainty, sites: day.sites };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `gridville-${day.id}-${day.seed.replace(':', '-').toLowerCase()}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <main className="learn-main">
    <section className="learn-hero"><span className="eyebrow">THE MATH UNDER THE MAP</span><h1>How does the solver know?</h1><p>A battery plan is a stack of linked decisions. Optimization turns every one into a variable, then searches for the combination with the most sparks.</p><button className="primary" onClick={download}><Download/> Download today’s data</button></section>
    <div className="learn-grid">
      <section className="card variables"><span className="section-number">01</span><h2>The decisions</h2><div className="variable"><code>x<sub>j</sub></code><p><b>Install or skip.</b> One binary switch for every candidate home <i>j</i>.</p></div><div className="variable"><code>c<sub>jt</sub>, d<sub>jt</sub></code><p><b>Charge and discharge.</b> Continuous energy quantities for home <i>j</i> in hour <i>t</i>.</p></div><div className="variable"><code>s<sub>jt</sub></code><p><b>Stored energy.</b> The battery’s state of charge after each hour.</p></div></section>
      <section className="card objective"><span className="section-number">02</span><h2>The objective</h2><div className="formula">max&nbsp; Σ<sub>j,t</sub> (p<sub>t</sub>d<sub>jt</sub> − p<sub>t</sub>c<sub>jt</sub> − κ(c<sub>jt</sub>+d<sub>jt</sub>)) − Σ<sub>j</sub> F<sub>j</sub>x<sub>j</sub></div><p>Sell energy, subtract purchases, account for wear <i>κ</i>, and pay each selected home’s fixed installation cost <i>F</i>.</p></section>
      <section className="card constraints"><span className="section-number">03</span><h2>Keep it physical</h2><ul><li><code>s<sub>jt</sub> = s<sub>j,t−1</sub> + √η<sub>j</sub>c<sub>jt</sub> − d<sub>jt</sub>/√η<sub>j</sub></code><span>Energy carries forward with round-trip losses split across charging and discharging.</span></li><li><code>0 ≤ s<sub>jt</sub> ≤ C<sub>j</sub>x<sub>j</sub></code><span>No battery means no storage; installed batteries cannot exceed capacity.</span></li><li><code>0 ≤ c<sub>jt</sub>, d<sub>jt</sub> ≤ P<sub>j</sub>x<sub>j</sub></code><span>Charging and discharging respect the site’s power rating.</span></li><li><code>s<sub>j,0</sub> = s<sub>j,24</sub> = 0</code><span>Every Gridville day starts and ends empty, so plans cannot borrow energy from tomorrow.</span></li></ul></section>
      <section className="card branch"><span className="section-number">04</span><h2>Why the binary switches matter</h2><p>If installations could be fractional, the model would be a linear program: a solver can move directly through a continuous landscape. A home battery cannot be 37% installed. Every yes/no choice splits the search.</p><div className="branch-diagram"><div>All plans</div><div><span>Aster: no</span><span>Aster: yes</span></div><div><i>bound</i><i>branch</i><i>best so far</i><i>bound</i></div></div><p>Branch-and-bound explores that decision tree. Linear relaxations give optimistic bounds; any branch that cannot beat the best feasible plan is discarded. This small neighborhood solves quickly, even when it is hard to reason through by hand.</p></section>
    </div>
    <aside className="literature-note"><BookOpen/><p>This model shares the fixed-charge structure studied in the general <b>facility-location literature</b>, paired here with a time-linked battery dispatch formulation. Gridville’s story, data, text, and artwork are original.</p></aside>
  </main>;
}

function Summary({ scores, code, onRestart }: { scores: Score[]; code: string; onRestart: () => void }) {
  const totalPlayer = scores.reduce((sum, score) => sum + score.player, 0);
  const totalOptimal = scores.reduce((sum, score) => sum + score.optimal, 0);
  return <main className="summary-main"><div className="summary-mark"><Trophy/></div><span className="eyebrow">MATCH COMPLETE · {code}</span><h1>Gridville is better balanced.</h1><p className="summary-sub">Six markets, one dispatch desk, and a healthy respect for mixed-integer optimization.</p><div className="summary-total"><div><small>TOTAL PROFIT</small><strong>{formatSpark(totalPlayer)}</strong></div><div><small>BENCHMARK CAPTURED</small><strong>{Math.round(totalPlayer / totalOptimal * 100)}%</strong></div></div><section className="card score-table">{scores.map((score, index) => <div key={score.day.id}><span>0{index + 1}</span><div><b>{score.day.title}</b><small>Round {score.day.round}</small></div><strong>{formatSpark(score.player)}</strong><em>{Math.round(score.player / score.optimal * 100)}%</em></div>)}</section><div className="summary-actions"><button className="primary" onClick={() => window.print()}><Download/> Save scorecard</button><button onClick={onRestart}><RotateCcw/> Play another match</button></div><p className="screenshot-note">Tip: this scorecard is designed to screenshot cleanly.</p></main>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [matchCode, setMatchCode] = useState(() => localStorage.getItem('gridville-code') || 'LONE-STAR');
  const [championship, setChampionship] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const sequence = useMemo(() => buildSequence(matchCode), [matchCode]);
  const day = sequence[dayIndex];
  const [plan, setPlan] = useState<PlayerPlan>(() => emptyPlan(buildSequence('LONE-STAR')[0]));
  const [selectedId, setSelectedId] = useState(day.sites[0].id);
  const [solver, setSolver] = useState<SolverResult>();
  const [actual, setActual] = useState<number[]>(day.prices);
  const [solving, setSolving] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);

  const start = () => { localStorage.setItem('gridville-code', matchCode || 'OPEN-GRID'); setDayIndex(0); const first = buildSequence(matchCode)[0]; setPlan(emptyPlan(first)); setSelectedId(first.sites[0].id); setScores([]); setScreen('game'); };
  const finish = async () => {
    setSolving(true);
    try { const result = await solveDay(day); const settled = realizePrices(day); setSolver(result); setActual(settled); setScreen('result'); } catch (error) { console.error(error); window.alert('The solver could not start. Refresh and try this day again.'); } finally { setSolving(false); }
  };
  const next = () => {
    if (!solver) return;
    const playerScore = evaluatePlan(day, plan, actual).profit;
    const optimalScore = evaluateOptimalOnPrices(day, solver, actual);
    const updatedScores = [...scores, { day, player: playerScore, optimal: optimalScore }];
    setScores(updatedScores);
    if (dayIndex === 5) { setScreen('summary'); return; }
    const nextIndex = dayIndex + 1; const nextDay = sequence[nextIndex]; setDayIndex(nextIndex); setPlan(emptyPlan(nextDay)); setSelectedId(nextDay.sites[0].id); setSolver(undefined); setActual(nextDay.prices); setScreen('game'); window.scrollTo(0, 0);
  };

  return <div className="app-shell">
    <header className="topbar"><button className="wordmark" onClick={() => setScreen('welcome')} aria-label="Gridville home"><span><BatteryCharging/></span><b>GRIDVILLE</b></button><nav><button className={screen === 'game' || screen === 'result' ? 'active' : ''} onClick={() => screen !== 'welcome' && setScreen('game')}>Dispatch desk</button><button className={screen === 'learn' ? 'active' : ''} onClick={() => setScreen('learn')}>Learn the model</button></nav><div className="desktop-note">BEST ON DESKTOP</div></header>
    {screen === 'welcome' && <Welcome code={matchCode} setCode={setMatchCode} championship={championship} setChampionship={setChampionship} onStart={start}/>} 
    {screen === 'game' && <GameScreen day={day} plan={plan} setPlan={setPlan} selectedId={selectedId} setSelectedId={setSelectedId} onDone={finish} solving={solving}/>} 
    {screen === 'result' && solver && <ResultScreen day={day} plan={plan} solver={solver} actual={actual} onNext={next} finalDay={dayIndex === 5} championship={championship}/>} 
    {screen === 'learn' && <Learn day={day}/>} 
    {screen === 'summary' && <Summary scores={scores} code={matchCode} onRestart={() => setScreen('welcome')}/>} 
  </div>;
}
