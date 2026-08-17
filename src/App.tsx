import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BatteryCharging, BookOpen, Check, ChevronRight, CircleDollarSign, CloudLightning, CloudSun, FastForward, Gauge, Lightbulb, LoaderCircle, LockKeyhole, Medal, Play, RotateCcw, Sparkles, Square, Trophy, Volume2, VolumeX, WandSparkles, X, Zap } from 'lucide-react';
import { buildSequence, CAMPAIGN_MANIFEST, FOUNDERS_PREVIEW, isChapterAvailable, realizePrices } from './data';
import { dispatchCallouts, emptyPlan, evaluatePlan, formatSpark, gradeForPercent, hourLabel, medalForGrade, performancePercent, pricesForSite, smartPresetGuide } from './logic';
import { evaluateOptimalOnPrices, solveDay } from './solver';
import type { Action, ChapterManifest, DayData, Grade, PlayerPlan, Site, SolverResult } from './types';
import { DispatchShowdown, HourlyDispatchBoard } from './DispatchBoard';
import type { BoardLessonTargets } from './DispatchBoard';

type Screen = 'welcome' | 'game' | 'result' | 'chapter' | 'field-guide' | 'summary';
type Score = { day: DayData; player: number; optimal: number; percent: number; grade: Grade; best: number };
type Sfx = 'click' | 'place' | 'paint' | 'lock' | 'cash' | 'fanfare' | 'thud';

function chapterFor(day: DayData): ChapterManifest {
  return CAMPAIGN_MANIFEST.find((chapter) => chapter.id === day.chapterId) ?? CAMPAIGN_MANIFEST[0];
}

function useSynth(muted: boolean) {
  const context = useRef<AudioContext>();
  return useCallback((kind: Sfx) => {
    if (muted) return;
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    context.current ??= new AudioContextClass();
    const audio = context.current;
    const now = audio.currentTime;
    const notes: Record<Sfx, Array<[number, number, number, OscillatorType]>> = {
      click: [[360, .035, .025, 'square']],
      paint: [[240, .035, .018, 'sine']],
      place: [[180, .08, .07, 'sawtooth'], [520, .16, .055, 'sine'], [880, .22, .035, 'sine']],
      lock: [[130, .2, .08, 'sawtooth'], [260, .32, .07, 'square']],
      cash: [[660, .09, .05, 'sine'], [880, .16, .055, 'sine'], [1100, .24, .04, 'sine']],
      fanfare: [[392, .18, .055, 'triangle'], [523, .32, .06, 'triangle'], [659, .48, .065, 'triangle'], [784, .7, .06, 'triangle']],
      thud: [[92, .28, .1, 'sine']],
    };
    notes[kind].forEach(([frequency, delay, volume, type], index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now + index * delay * .7);
      if (kind === 'place' || kind === 'lock') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.8, now + index * delay * .7 + delay);
      gain.gain.setValueAtTime(0.0001, now + index * delay * .7);
      gain.gain.exponentialRampToValueAtTime(volume, now + index * delay * .7 + .008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * delay * .7 + Math.max(.06, delay));
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + index * delay * .7);
      oscillator.stop(now + index * delay * .7 + Math.max(.08, delay) + .03);
    });
  }, [muted]);
}

function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, value]);
  return <>{formatSpark(shown)}</>;
}

function CampaignRail({ active }: { active: number }) {
  return <div className="campaign-rail" aria-label="Campaign progress">
    {CAMPAIGN_MANIFEST.map((chapter) => <div key={chapter.id} className={`rail-stop ${chapter.number < active ? 'complete' : ''} ${chapter.number === active ? 'active' : ''}`} title={`${chapter.number}. ${chapter.title}: ${chapter.concept}`}>
      <span style={{ '--chapter-color': chapter.color } as CSSProperties}>{chapter.number < active ? <Check/> : chapter.number}</span><small>{chapter.shortTitle}</small>
    </div>)}
  </div>;
}

function TownScene({ day, plan, selectedId, hour, onSite }: { day: DayData; plan: PlayerPlan; selectedId: string; hour: number; onSite: (id: string) => void }) {
  const evaluation = evaluatePlan(day, plan);
  const daylight = hour >= 6 && hour < 19;
  const sunX = 90 + (hour / 23) * 1020;
  const sunY = 175 - Math.sin((hour / 23) * Math.PI) * 120;
  const point = (site: Site) => ({ x: 250 + site.x * 7.2, y: 250 + site.y * 3.3 });
  return <div className={`town-scene ${daylight ? 'daylight' : 'nighttime'}`} style={{ '--time': `${hour / 23}` } as CSSProperties}>
    <svg viewBox="0 0 1200 690" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Animated Gridville neighborhood at ${hourLabel(hour)}`}>
      <defs>
        <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop stopColor={daylight ? '#59b9e9' : '#101a3c'}/><stop offset=".62" stopColor={daylight ? '#bce8e2' : '#2b315d'}/><stop offset="1" stopColor={daylight ? '#f7d98d' : '#4c3f62'}/></linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#66a86b"/><stop offset="1" stopColor="#254f45"/></linearGradient>
        <filter id="houseGlow"><feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#d7ff63" floodOpacity=".9"/></filter>
        <filter id="sparkGlow"><feGaussianBlur stdDeviation="2"/></filter>
        <pattern id="roadDash" width="48" height="8" patternUnits="userSpaceOnUse"><rect width="24" height="3" fill="#f7df9c" opacity=".6"/></pattern>
      </defs>
      <rect width="1200" height="690" fill="url(#skyDay)"/>
      <g className="stars">{Array.from({ length: 26 }, (_, index) => <circle key={index} cx={(index * 83 + 47) % 1170} cy={(index * 47 + 31) % 215} r={index % 4 === 0 ? 2 : 1}/>)}</g>
      <circle className="sun" cx={sunX} cy={sunY} r="43"/>
      <g className="cloud cloud-one"><ellipse cx="190" cy="106" rx="63" ry="19"/><circle cx="164" cy="93" r="25"/><circle cx="205" cy="87" r="34"/></g>
      <g className="cloud cloud-two"><ellipse cx="870" cy="145" rx="74" ry="20"/><circle cx="840" cy="127" r="28"/><circle cx="890" cy="119" r="37"/></g>
      <path d="M0 275 Q165 176 325 264 T650 243 T950 261 T1200 211 V430 H0Z" className="far-hills"/>
      <path d="M0 337 Q172 245 350 337 T701 319 T1020 318 T1200 275 V690 H0Z" fill="url(#ground)"/>
      <path d="M-80 520 C170 435 390 470 606 535 S1010 575 1280 460" className="road-edge"/>
      <path d="M-80 520 C170 435 390 470 606 535 S1010 575 1280 460" className="road"/>
      <path d="M-80 520 C170 435 390 470 606 535 S1010 575 1280 460" className="road-dashes"/>
      <path d="M405 690 C414 573 476 478 511 350" className="road-edge side"/>
      <path d="M405 690 C414 573 476 478 511 350" className="road side"/>
      <g className="windmill" transform="translate(1030 245)"><path d="M0 0V155"/><circle r="9"/><path d="M0 0L-49 -18M0 0L9 52M0 0L39 -35"/></g>
      <g className="water-tower" transform="translate(965 325)"><ellipse cx="0" cy="0" rx="38" ry="20"/><path d="M-35 0Q-31 55 0 61Q31 55 35 0M-20 55L-29 137M20 55L29 137M-26 111H26"/><text x="0" y="6" textAnchor="middle">GRIDVILLE</text></g>
      {day.sites.map((site) => {
        const p = point(site);
        const installed = plan[site.id]?.installed;
        const selected = selectedId === site.id;
        const siteEval = evaluation.sites.find((entry) => entry.siteId === site.id)!;
        const flow = siteEval.flows[hour] ?? { charge: 0, discharge: 0, soc: 0 };
        const activePower = Math.max(flow.charge, flow.discharge);
        const direction = flow.discharge > .01 ? 'out' : flow.charge > .01 ? 'in' : 'idle';
        const toGrid = `M${p.x} ${p.y - 20} Q${(p.x + 915) / 2} ${p.y - 110} 915 410`;
        const fromGrid = `M915 410 Q${(p.x + 915) / 2} ${p.y - 110} ${p.x} ${p.y - 20}`;
        return <g key={site.id}>
          {installed && direction !== 'idle' && <g className={`energy-flow ${direction}`}>
            <path d={direction === 'out' ? toGrid : fromGrid}/>
            {Array.from({ length: Math.max(1, Math.min(4, Math.ceil(activePower / 1.5))) }, (_, index) => <circle key={`${hour}-${index}`} r={3 + activePower / 5}><animateMotion dur={`${Math.max(.55, 1.55 - activePower / 8)}s`} begin={`${index * -.31}s`} repeatCount="indefinite" path={direction === 'out' ? toGrid : fromGrid}/></circle>)}
          </g>}
          <g className={`town-home ${installed ? 'installed' : ''} ${selected ? 'selected' : ''}`} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${site.name}, ${site.zone} zone, ${installed ? 'battery installed' : 'candidate battery site'}`} onClick={() => onSite(site.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSite(site.id); } }}>
            <ellipse className="home-shadow" cy="25" rx="43" ry="11"/>
            <path className="home-body" d="M-34 -8L0 -36L34 -8V28H-34Z" style={{ fill: installed ? site.color : '#f9e9c8' }}/>
            <path className="home-roof" d="M-41 -6L0 -42L41 -6L33 2L0 -28L-33 2Z"/>
            <rect className="door" x="-7" y="6" width="14" height="22" rx="2"/>
            <rect className={`window ${hour >= 17 || hour < 7 ? 'lit' : ''}`} x="-26" y="2" width="12" height="11" rx="2"/>
            <rect className={`window ${hour >= 18 || hour < 6 ? 'lit' : ''}`} x="15" y="2" width="12" height="11" rx="2"/>
            {installed && <g className="battery-pack" transform="translate(28 8)"><rect x="-8" y="-13" width="18" height="29" rx="4"/><rect x="-3" y="-17" width="8" height="4" rx="1"/><path d={`M-4 11V${11 - Math.max(2, (flow.soc / site.capacity) * 19)}H6V11Z`}/><path className="bolt" d="M2 -9L-4 0H1L-2 8L6 -2H1Z"/></g>}
            {!installed && <circle className="candidate-pulse" cy="-7" r="48"/>}
            {selected && <g className="site-tag"><rect x="-58" y="-70" width="116" height="22" rx="11"/><text x="0" y="-55" textAnchor="middle">{site.name}</text></g>}
          </g>
        </g>;
      })}
      <g className="substation" transform="translate(915 410)"><circle r="48"/><path d="M-19 29L0 -30L19 29M-12 6H12M-23 29H23M0 -30V-44"/><circle cy="-49" r="5"/><text x="0" y="67" textAnchor="middle">GRID</text></g>
      <g className="scene-details"><path d="M69 603q18-25 36 0q-18 18-36 0"/><circle cx="96" cy="585" r="4"/><path d="M195 576q12-19 24 0M204 561l-6-9m12 9l7-8"/></g>
      {day.zonePriceAdjustments && <g className="zone-labels"><text x="320" y="650">WEST · SOLAR</text><text x="585" y="650">CENTRAL</text><text x="800" y="650">EAST · CONGESTED</text></g>}
    </svg>
  </div>;
}

function DayBriefing({ day, onGo }: { day: DayData; onGo: () => void }) {
  const chapter = chapterFor(day);
  const installs = day.sites.map((site) => site.installCost);
  const efficiencies = day.sites.map((site) => site.efficiency);
  return <div className="briefing-backdrop"><section className="day-briefing" style={{ '--chapter-color': chapter.color } as CSSProperties}>
    <div className="broadcast-line"><span className="live-dot"/> GRIDVILLE LIVE · CHAPTER {chapter.number}{day.boss ? ' · BOSS DAY' : ''}</div>
    <div className="briefing-grid"><div><span className="briefing-kicker">{chapter.title}</span><h1>{day.title}</h1><p className="concept-line"><Zap/> {day.lesson}</p></div><div className="briefing-weather"><CloudSun/><b>{day.weather}</b><span>{day.briefing?.alert}</span></div></div>
    <div className="news-ticker"><div><small>GRID GOSSIP</small><p>{day.briefing?.gossip}</p></div><div className="rival-call"><div className="rival-avatar">RC</div><div><small>RIVAL DESK · RAE CURRENT</small><p>{day.briefing?.rival}</p></div></div></div>
    <section className="cost-feed" aria-label="Today's battery costs"><article><CircleDollarSign/><span><small>INSTALL TICKET</small><b>{formatSpark(Math.min(...installs))}–{formatSpark(Math.max(...installs))}</b><em>per battery</em></span></article><article><Zap/><span><small>WEAR METER</small><b>₷{day.degradationCost.toFixed(1)} / kWh</b><em>every kWh moved</em></span></article><article><BatteryCharging/><span><small>BATTERY EFFICIENCY</small><b>{Math.round(Math.min(...efficiencies) * 100)}–{Math.round(Math.max(...efficiencies) * 100)}%</b><em>some energy stays home</em></span></article></section>
    {day.demandResponse && <div className="event-callout"><CloudLightning/><div><b>{day.demandResponse.name} event</b><span>{day.demandResponse.description}</span></div></div>}
    <button className="briefing-go" onClick={onGo}>Take the controls <ArrowRight/></button>
  </section></div>;
}

function firstSparkTargets(prices: number[]): BoardLessonTargets {
  const peakHour = prices.indexOf(Math.max(...prices));
  const cheapHours = Array.from({ length: peakHour }, (_, hour) => hour).sort((a, b) => prices[a] - prices[b]).slice(0, 2).sort((a, b) => a - b);
  return { cheapHours, peakHour };
}

function FirstSparkLesson({ day, site, targets, onClose }: { day: DayData; site: Site; targets: BoardLessonTargets; onClose: () => void }) {
  const prices = pricesForSite(day, site);
  return <aside className="spark-lesson"><div><span>FIRST SPARK BOARD</span><b>Carry the valley into the spike.</b><p>Follow the CHEAP flags at {targets.cheapHours.map((hour) => `${hourLabel(hour)} (₷${prices[hour].toFixed(1)})`).join(' and ')}, then save it for the SPIKE at {hourLabel(targets.peakHour)} (₷{prices[targets.peakHour].toFixed(1)}). Start and end empty.</p></div><button onClick={onClose}>Got it <Check/></button><button className="quiet" onClick={onClose}>Skip</button></aside>;
}

function GameScreen({ day, dayIndex, plan, setPlan, selectedId, setSelectedId, onDone, solving, sfx }: { day: DayData; dayIndex: number; plan: PlayerPlan; setPlan: (plan: PlayerPlan) => void; selectedId: string; setSelectedId: (id: string) => void; onDone: () => void; solving: boolean; sfx: (kind: Sfx) => void }) {
  const [briefing, setBriefing] = useState(true);
  const [tool, setTool] = useState<Action>(-1);
  const [scrubHour, setScrubHour] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [locking, setLocking] = useState(false);
  const [guide, setGuide] = useState<'place' | 'paint' | 'lock' | 'done'>(dayIndex === 0 ? 'place' : 'done');
  const [showSparkLesson, setShowSparkLesson] = useState(dayIndex === 0);
  const [raeReaction, setRaeReaction] = useState('Rae: “Pick the tool. The numbers are not hiding anymore.”');
  const [smartHint, setSmartHint] = useState<string>();
  const evaluation = evaluatePlan(day, plan);
  const selectedSite = day.sites.find((site) => site.id === selectedId) ?? day.sites[0];
  const selectedPlan = plan[selectedSite.id];
  const selectedEval = evaluation.sites.find((site) => site.siteId === selectedSite.id)!;
  const installed = day.sites.filter((site) => plan[site.id]?.installed);
  const currentFlow = selectedEval.flows[scrubHour] ?? { charge: 0, discharge: 0, soc: 0 };
  const chapter = chapterFor(day);
  const lessonTargets = useMemo(() => dayIndex === 0 ? firstSparkTargets(pricesForSite(day, selectedSite)) : undefined, [day, dayIndex, selectedSite]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setScrubHour((hour) => hour >= 23 ? 0 : hour + 1), 650);
    return () => window.clearInterval(timer);
  }, [playing]);

  const chooseSite = (id: string) => {
    setSelectedId(id);
    if (!plan[id].installed) {
      setPlan({ ...plan, [id]: { installed: true, actions: [...plan[id].actions] } });
      sfx('place');
      setRaeReaction('Rae: “Battery online. Now make the cheap hours do some work.”');
      if (guide === 'place') setGuide('paint');
    } else sfx('click');
  };
  const paint = (hour: number, action: Action) => {
    if (!selectedPlan.installed || selectedPlan.actions[hour] === action) return;
    const actions = [...selectedPlan.actions]; actions[hour] = action;
    setPlan({ ...plan, [selectedSite.id]: { ...selectedPlan, actions } });
    setSmartHint(undefined);
    sfx('paint');
    setScrubHour(hour);
    setRaeReaction(action === -1 ? `Rae: “Buying at ${hourLabel(hour)}. I hope you saw the price.”` : action === 1 ? `Rae: “Selling at ${hourLabel(hour)}. Make the spike proud.”` : `Rae: “${hourLabel(hour)} cleared. Clean slate.”`);
    if (guide === 'paint') setGuide('lock');
  };
  const smartPlan = () => {
    const prices = pricesForSite(day, selectedSite);
    const preset = smartPresetGuide(selectedSite, prices);
    const describe = (hours: number[]) => hours.map((hour) => `${hourLabel(hour)} (₷${prices[hour].toFixed(1)})`).join(', ');
    setPlan({ ...plan, [selectedSite.id]: { installed: true, actions: preset.actions } });
    setSmartHint(`Smart start heuristic: buy the cheapest hours before the best spread—${describe(preset.chargeHours)}—then sell the strongest later hours—${describe(preset.dischargeHours)}. Check the labels; it is a worked example, not the answer.`);
    setRaeReaction('Rae: “Study the highlighted hours. A shortcut only helps if you can explain it.”');
    sfx('cash');
    if (guide === 'paint') setGuide('lock');
  };
  const remove = () => {
    setPlan({ ...plan, [selectedSite.id]: { ...selectedPlan, installed: false } });
    sfx('thud');
  };
  const lock = () => {
    if (!installed.length || !evaluation.feasible || locking || solving) return;
    setLocking(true); setGuide('done'); setPlaying(true); setRaeReaction('Rae: “No take-backs. Let’s see what the machine found.”'); sfx('lock');
    window.setTimeout(() => { setPlaying(false); setScrubHour(23); onDone(); }, 900);
  };

  return <main className="play-screen" style={{ '--chapter-color': chapter.color } as CSSProperties}>
    <div className="game-hud"><div><span className="chapter-chip">CH {chapter.number}</span><div><small>{day.boss ? 'BOSS DAY' : `DAY ${day.dayInRound}`} · {chapter.title}</small><h1>{day.title}</h1></div></div><CampaignRail active={chapter.number}/><div className="weather-chip"><CloudSun/><span>{day.weather}</span></div></div>
    <div className="play-layout">
      <aside className="left-dock">
        <div className="dock-title"><span>LIVE FLEET</span><b>{installed.length}/{day.sites.length}</b></div>
        <p className="mission-copy">{day.lesson}</p>
        {day.demandResponse && <div className="mini-event"><CloudLightning/><div><b>{day.demandResponse.name}</b><span>Hold stored energy through {hourLabel(day.demandResponse.hour)} for +₷{day.demandResponse.rewardPerStoredKWh}/kWh.</span></div></div>}
        {day.zonePriceAdjustments && <div className="zone-key"><b>LOCAL PRICES</b><span><i className="west"/>West solar</span><span><i className="central"/>Central</span><span><i className="east"/>East congestion</span></div>}
        <div className="fleet-list">{day.sites.map((site) => {
          const siteResult = evaluation.sites.find((entry) => entry.siteId === site.id)!;
          return <button key={site.id} className={`${selectedId === site.id ? 'selected' : ''} ${plan[site.id].installed ? 'installed' : ''}`} onClick={() => chooseSite(site.id)} title={`${site.capacity} kWh · ${site.power} kW · ${Math.round(site.efficiency * 100)}% efficient · ${formatSpark(site.installCost)} install`}><i style={{ background: site.color }}/><span><b>{site.name}</b><small>{site.zone} · {site.capacity} kWh</small></span>{plan[site.id].installed ? <em className={siteResult.profit >= 0 ? 'positive' : ''}>{formatSpark(siteResult.profit)}</em> : <strong>+</strong>}</button>;
        })}</div>
        <div className="gossip-card"><small>RIVAL RADIO</small><p>{day.briefing?.rival}</p><span>— Rae Current</span></div>
      </aside>
      <section className="scene-stage">
        <TownScene day={day} plan={plan} selectedId={selectedId} hour={scrubHour} onSite={chooseSite}/>
        <div className="sim-strip"><button onClick={() => { setPlaying(!playing); sfx('click'); }} aria-label={playing ? 'Pause day simulation' : 'Play day simulation'}>{playing ? <Square/> : <Play/>}</button><b>{hourLabel(scrubHour)}</b><input aria-label="Time of day" type="range" min="0" max="23" value={scrubHour} onChange={(event) => { setPlaying(false); setScrubHour(Number(event.target.value)); }}/><span>{currentFlow.charge > .01 ? <><ArrowDown/> CHARGING {currentFlow.charge.toFixed(1)} kW</> : currentFlow.discharge > .01 ? <><ArrowUp/> EXPORTING {currentFlow.discharge.toFixed(1)} kW</> : <><FastForward/> FLEET IDLE</>}</span></div>
        {guide === 'place' && <div className="guide-bubble guide-place"><span>1</span><div><b>Wake up a home</b><p>Click any pulsing house to place your first battery.</p></div></div>}
      </section>
      <aside className="dispatch-dock">
        <div className="site-console"><div className="site-console-head"><i style={{ background: selectedSite.color }}/><div><small>{selectedSite.zone} ZONE · SELECTED</small><h2>{selectedSite.name}</h2><span>{selectedSite.street}</span></div>{selectedPlan.installed ? <button onClick={remove} title="Remove this battery"><X/></button> : null}</div>
          <div className="stat-chips"><span><b>{selectedSite.capacity}</b> kWh</span><span><b>{selectedSite.power}</b> kW</span><span><b>{Math.round(selectedSite.efficiency * 100)}%</b> eff.</span><span><b>{formatSpark(selectedSite.installCost)}</b> install</span></div>
        </div>
        <div className="chart-console">
          <div className="console-heading"><div><small>PAINT ON THE MARKET</small><b>{day.uncertainty.some(Boolean) ? 'Forecast price' : 'Grid price'} · ₷/kWh</b></div><button onClick={smartPlan} disabled={!selectedPlan.installed} title="Build a strong buy-low / sell-high starting schedule"><WandSparkles/> Smart start</button></div>
          {showSparkLesson && lessonTargets && <FirstSparkLesson day={day} site={selectedSite} targets={lessonTargets} onClose={() => setShowSparkLesson(false)}/>}
          <HourlyDispatchBoard day={day} site={selectedSite} actions={selectedPlan.actions} flows={selectedEval.flows} tool={tool} scrubHour={scrubHour} disabled={!selectedPlan.installed} lessonTargets={showSparkLesson ? lessonTargets : undefined} onPaint={paint} onInspect={(hour) => { setPlaying(false); setScrubHour(hour); }}/>
          {smartHint && <aside className="smart-start-note"><WandSparkles/><span>{smartHint}</span></aside>}
          <div className="paint-tools"><button className={tool === -1 ? 'active charge' : ''} onClick={() => { setTool(-1); sfx('click'); }} title="Drag over hours to buy energy and fill the battery"><ArrowDown/><span><b>Charge</b><small>buy energy</small></span></button><button className={tool === 0 ? 'active idle' : ''} onClick={() => { setTool(0); sfx('click'); }} title="Drag to erase charge or discharge actions"><X/><span><b>Idle</b><small>hold energy</small></span></button><button className={tool === 1 ? 'active discharge' : ''} onClick={() => { setTool(1); sfx('click'); }} title="Drag over hours to sell stored energy"><ArrowUp/><span><b>Discharge</b><small>sell energy</small></span></button></div>
          <p className="rae-reaction">{raeReaction}</p>
          {!selectedEval.feasible && <div className="return-warning"><Lightbulb/><span><b>Bring it home empty.</b> Add discharge after the last charge; every day starts and ends at 0 kWh.</span></div>}
        </div>
        {guide === 'paint' && <div className="guide-bubble guide-paint"><span>2</span><div><b>Write the schedule</b><p>Pick a tool, then drag across the numbered cheap and expensive hours.</p></div></div>}
      </aside>
    </div>
    <footer className="live-ledger">
      <div className="profit-orb" key={Math.round(evaluation.profit)}><CircleDollarSign/><span><small>LIVE PROFIT</small><b className={evaluation.profit >= 0 ? 'positive' : 'negative'}>{formatSpark(evaluation.profit)}</b></span></div>
      <div className="ledger-parts"><span><small>MARKET SALES</small><b>+{formatSpark(evaluation.revenue)}</b></span>{day.demandResponse && <span className="reserve"><small>FLEX REWARD</small><b>+{formatSpark(evaluation.reserveRevenue)}</b></span>}<span><small>ENERGY BOUGHT</small><b>−{formatSpark(evaluation.energyCost)}</b></span><span><small>HARDWARE + WEAR</small><b>−{formatSpark(evaluation.installCost + evaluation.degradation)}</b></span></div>
      <button className={`lock-button ${locking ? 'locking' : ''}`} disabled={!installed.length || !evaluation.feasible || solving || locking} onClick={lock}><i/><span>{solving ? <><LoaderCircle className="spin"/> SOLVER WAKING…</> : locking ? <><Zap/> CHARGING DECISION…</> : <><LockKeyhole/> LOCK IT IN</>}</span></button>
      {guide === 'lock' && evaluation.feasible && <div className="guide-bubble guide-lock"><span>3</span><div><b>Make it count</b><p>Watch the profit react, then lock your plan to face Rae and HiGHS.</p></div></div>}
    </footer>
    {briefing && <DayBriefing day={day} onGo={() => { setBriefing(false); sfx('click'); }}/>}
  </main>;
}

function SolverTown({ day, solver, stage, hidden }: { day: DayData; solver: SolverResult; stage: number; hidden: boolean }) {
  return <div className={`solver-town stage-${stage} ${hidden ? 'sealed' : ''}`}>
    <svg viewBox="0 0 700 330" aria-label={hidden ? 'Solver plan sealed for championship mode' : 'Solver battery sites sweeping onto Gridville'}>
      <defs><linearGradient id="resultSky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#172748"/><stop offset="1" stopColor="#513653"/></linearGradient></defs>
      <rect width="700" height="330" fill="url(#resultSky)"/><circle cx="570" cy="61" r="35" className="result-moon"/><path d="M0 190Q120 128 240 190T480 182T700 162V330H0Z" className="result-ground"/><path d="M-20 277Q160 213 350 265T720 230" className="result-road"/>
      {day.sites.map((site, index) => {
        const optimal = solver.plans.find((plan) => plan.siteId === site.id);
        const x = 45 + site.x * 6;
        const y = 155 + site.y * 1.45;
        return <g key={site.id} className={`result-house ${optimal?.installed && !hidden ? 'optimal' : ''}`} style={{ '--delay': `${index * 55}ms` } as CSSProperties} transform={`translate(${x} ${y})`}><path d="M-17 0L0 -15L17 0V18H-17Z"/><rect x="-4" y="6" width="8" height="12"/>{optimal?.installed && !hidden && <g className="solver-battery"><rect x="15" y="0" width="10" height="18" rx="2"/><path d="M20 3L17 9H20L18 15L24 8H21Z"/></g>}</g>;
      })}
      <g className="solver-sweep"><line x1="0" x2="0" y1="0" y2="330"/><rect width="80" height="330"/></g>
      {hidden && <g className="sealed-plan"><circle cx="350" cy="162" r="52"/><path d="M329 154V142a21 21 0 0142 0v12M323 154h54v42h-54z"/><text x="350" y="223" textAnchor="middle">CHAMPIONSHIP PLAN SEALED</text></g>}
    </svg>
  </div>;
}

function ResultScreen({ day, plan, solver, actual, selectedId, championship, finalDay, onNext, sfx }: { day: DayData; plan: PlayerPlan; solver: SolverResult; actual: number[]; selectedId: string; championship: boolean; finalDay: boolean; onNext: () => void; sfx: (kind: Sfx) => void }) {
  const [stage, setStage] = useState(0);
  const player = evaluatePlan(day, plan, actual);
  const optimum = evaluateOptimalOnPrices(day, solver, actual);
  const percent = performancePercent(player.profit, optimum);
  const grade = gradeForPercent(percent);
  const medal = medalForGrade(grade);
  const showdownSite = day.sites.find((site) => site.id === selectedId && plan[site.id]?.installed) ?? day.sites.find((site) => plan[site.id]?.installed) ?? day.sites.find((site) => site.id === selectedId) ?? day.sites[0];
  const callouts = championship ? ['Rae sealed HiGHS’s site and hour choices for this match. Your benchmark score still settles in public.'] : dispatchCallouts(day, plan, solver, actual);
  const chapter = chapterFor(day);
  const title = grade === 'S' ? 'You bent the curve.' : grade === 'A' ? 'Rae felt that one.' : grade === 'B' ? 'Strong grid instincts.' : grade === 'C' ? 'The town stayed lit.' : 'Doug the battery requests a rematch.';
  const roast = percent < 50 ? `Rae captured ${100 - percent}% more of the benchmark. She has already printed a tiny victory banner.` : '';
  useEffect(() => {
    const solverTimer = window.setTimeout(() => { setStage(1); sfx('cash'); }, 900);
    const gradeTimer = window.setTimeout(() => { setStage(2); sfx(percent >= 90 ? 'fanfare' : 'thud'); }, 2100);
    return () => { window.clearTimeout(solverTimer); window.clearTimeout(gradeTimer); };
  }, [percent, sfx]);
  return <main className={`reveal-screen reveal-stage-${stage}`} style={{ '--chapter-color': chapter.color } as CSSProperties}>
    {stage >= 2 && percent >= 90 && <div className="confetti" aria-hidden="true">{Array.from({ length: 72 }, (_, index) => <i key={index} style={{ '--x': `${(index * 47) % 100}vw`, '--delay': `${(index % 12) * -.17}s`, '--color': ['#d7ff63', '#ffd166', '#ff7b63', '#8ee3c8', '#a9b8ff'][index % 5] } as CSSProperties}/>)}</div>}
    <header className="reveal-header"><div><span>DAY SETTLED · {day.title}</span><b>HiGHS benchmark solved in {(solver.solveMs / 1000).toFixed(2)}s</b></div><CampaignRail active={chapter.number}/></header>
    {stage >= 2 && <DispatchShowdown day={day} site={showdownSite} plan={plan} solver={solver} actual={actual} hidden={championship}/>}
    <section className="reveal-arena">
      <div className="reveal-copy"><span className="reveal-kicker">THE MARKET HAS SPOKEN</span><h1>{stage < 2 ? (stage === 0 ? 'Counting your sparks…' : 'The solver enters…') : title}</h1><p>{stage < 2 ? 'Your locked dispatch is settling hour by hour.' : roast || `You captured ${percent}% of the mathematical benchmark with honest battery physics.`}</p>
        <div className="score-duel"><div className="duel-player"><small>YOUR VPP</small><strong><AnimatedNumber value={player.profit}/></strong><span>{Object.values(plan).filter((site) => site.installed).length} batteries</span></div><div className="versus">VS</div><div className={`duel-solver ${stage >= 1 ? 'shown' : ''}`}><small>{day.uncertainty.some(Boolean) ? 'FORECAST BENCHMARK' : 'HIGHS OPTIMUM'}</small><strong>{stage >= 1 ? <AnimatedNumber value={optimum}/> : '₷???'}</strong><span>{solver.plans.filter((site) => site.installed).length} batteries</span></div></div>
      </div>
      <div className="solver-visual"><SolverTown day={day} solver={solver} stage={stage} hidden={championship}/><div className="solver-caption"><Sparkles/><span><b>{championship ? 'Plan sealed for the next player' : 'Solver sweep'}</b>{championship ? 'Profit counts; sites stay secret.' : 'Each lime battery is a site HiGHS chose.'}</span></div></div>
      <div className={`grade-stamp grade-${grade}`}><small>GRIDVILLE GRADE</small><b>{stage >= 2 ? grade : '—'}</b><span>{stage >= 2 ? `${percent}% OF OPTIMAL` : 'CALCULATING'}</span>{stage >= 2 && medal !== 'none' && <em><Medal/> {medal} medal</em>}</div>
    </section>
    {stage >= 2 && <section className="reveal-lessons"><article><Lightbulb/><div><small>WHAT THE NUMBERS SAID</small>{callouts.map((callout) => <p key={callout}>{callout}</p>)}</div></article><article><Gauge/><div><small>WHAT THE SOLVER SAW · {chapter.shortTitle.toUpperCase()}</small><p>{chapter.fieldGuide}</p></div></article><button onClick={onNext}>{finalDay ? <>Campaign scorecard <Trophy/></> : day.boss ? <>Chapter results <Medal/></> : <>Next dispatch <ChevronRight/></>}</button></section>}
  </main>;
}

function ChapterSummary({ day, scores, finalChapter, onContinue }: { day: DayData; scores: Score[]; finalChapter: boolean; onContinue: () => void }) {
  const chapter = chapterFor(day);
  const chapterScores = scores.filter((score) => score.day.chapterId === day.chapterId);
  const average = Math.round(chapterScores.reduce((sum, score) => sum + score.percent, 0) / Math.max(1, chapterScores.length));
  const grade = gradeForPercent(average);
  return <main className="chapter-summary" style={{ '--chapter-color': chapter.color } as CSSProperties}><CampaignRail active={chapter.number}/><div className="chapter-medal"><Medal/></div><span>CHAPTER {chapter.number} CLEARED</span><h1>{chapter.title}</h1><p>{chapter.concept}</p><div className="chapter-score"><div><small>CHAPTER GRADE</small><b>{grade}</b></div><div><small>BENCHMARK CAPTURED</small><b>{average}%</b></div><div><small>BEST DAY</small><b>{Math.max(...chapterScores.map((score) => score.percent), 0)}%</b></div></div><section className="chapter-recap">{chapterScores.map((score) => <div key={score.day.id}><i className={`medal-${medalForGrade(score.grade)}`}><Medal/></i><span><b>{score.day.title}</b><small>Personal best {score.best}%</small></span><strong>{formatSpark(score.player)}</strong><em>{score.grade}</em></div>)}</section><blockquote><small>FIELD NOTE UNLOCKED</small>“{chapter.fieldGuide}”</blockquote><button onClick={onContinue}>{finalChapter ? <>Build final scorecard <Trophy/></> : <>Enter next chapter <ArrowRight/></>}</button></main>;
}

function FieldGuide({ progress }: { progress: number }) {
  return <main className="field-guide"><header><span>GRIDVILLE FIELD GUIDE</span><h1>What the grid taught you.</h1><p>Each chapter turns one optimization idea into something you can see, hear, and play.</p></header><section className="guide-primer"><article><small>POCKET GLOSSARY</small><p><b>Price spread</b> is the gap between a cheap buy and a valuable sell. <b>SOC</b> is energy still in the battery. <b>Efficiency</b> means some sparks stay behind. <b>Wear</b> is the tiny toll paid for moving them. <b>Demand response</b> pays you to hold energy when Gridville calls.</p></article><article><small>WHY INVITE A SOLVER?</small><p><b>Valuable:</b> it checks every price, site, and battery at once. <b>Hard by hand:</b> 24 numbered hours multiply fast. <b>Essential:</b> it gives your classroom an honest benchmark—then leaves room for your own smart plan.</p></article></section><div className="guide-index">{CAMPAIGN_MANIFEST.map((chapter) => {
    const unlocked = chapter.number <= progress;
    return <article key={chapter.id} className={unlocked ? 'unlocked' : 'locked'} style={{ '--chapter-color': chapter.color } as CSSProperties}><div className="guide-number">{chapter.number}</div><div><span>{chapter.tier === 'free' ? 'FREE CAMPAIGN' : FOUNDERS_PREVIEW ? 'FOUNDERS PREVIEW' : 'PREMIUM'}</span><h2>{chapter.title}</h2><p>{unlocked ? chapter.fieldGuide : 'Play the previous chapter to decode this field note.'}</p></div><i>{unlocked ? <BookOpen/> : <LockKeyhole/>}</i></article>;
  })}</div><aside><Sparkles/><div><b>Founders preview is active</b><span>All six playable chapters are unlocked. Progress only gates field-guide notes; there are no payments or accounts.</span></div></aside></main>;
}

function Welcome({ code, setCode, championship, setChampionship, onStart }: { code: string; setCode: (code: string) => void; championship: boolean; setChampionship: (value: boolean) => void; onStart: () => void }) {
  return <main className="welcome-screen"><section className="welcome-world"><div className="welcome-sky"><i className="welcome-sun"/><i className="welcome-cloud one"/><i className="welcome-cloud two"/></div><div className="welcome-town">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ '--house': index, '--color': ['#ffd166', '#ff9675', '#66d2bd', '#85b8ff'][index % 4] } as CSSProperties}/>)}</div><div className="welcome-lines">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ '--particle': index } as CSSProperties}/>)}</div><div className="hero-copy"><div className="town-badge"><Zap/> GRIDVILLE VIRTUAL POWER CO.</div><h1>Play the grid.<br/><em>Beat the machine.</em></h1><p>A battery-strategy campaign where every spark moves, every choice pays, and a real optimization solver is waiting at the end of each day.</p><button onClick={onStart}>Start the campaign <ArrowRight/></button><span>9 scenario days · 6 chapters · 1 VPP boss</span></div></section>
    <aside className="welcome-console"><div className="console-top"><BatteryCharging/><div><small>DISPATCH CONSOLE</small><b>NEW CAMPAIGN</b></div><span>ONLINE</span></div><div className="match-setup"><label htmlFor="match-code">MATCH CODE</label><input id="match-code" value={code} maxLength={18} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}/><small>Same code = same prices, weather surprises, and solver benchmark.</small></div><button className={`championship-switch ${championship ? 'on' : ''}`} role="switch" aria-checked={championship} onClick={() => setChampionship(!championship)}><span>{championship && <Check/>}</span><div><b>Championship mode</b><small>Seal solver site choices between players.</small></div></button><div className="campaign-preview"><div className="preview-heading"><span>CAMPAIGN MAP</span><b>FOUNDERS PREVIEW · ALL OPEN</b></div>{CAMPAIGN_MANIFEST.map((chapter) => <div className="preview-chapter" key={chapter.id}><i style={{ background: chapter.color }}>{chapter.number}</i><span><b>{chapter.title}</b><small>{chapter.concept}</small></span><em>{chapter.tier === 'free' ? 'FREE' : 'PREVIEW'}</em></div>)}</div></aside>
  </main>;
}

function FinalSummary({ scores, code, onRestart }: { scores: Score[]; code: string; onRestart: () => void }) {
  const totalPlayer = scores.reduce((sum, score) => sum + score.player, 0);
  const totalOptimal = scores.reduce((sum, score) => sum + score.optimal, 0);
  const captured = performancePercent(totalPlayer, totalOptimal);
  const grade = gradeForPercent(captured);
  return <main className="final-scorecard"><div className="scorecard-rays"/><div className="final-mark"><Trophy/></div><span>GRIDVILLE CAMPAIGN COMPLETE · {code}</span><h1>Certified grid whisperer.</h1><p>Nine markets. Six optimization ideas. One neighborhood still humming.</p><div className="final-total"><div><small>FINAL GRADE</small><b>{grade}</b></div><div><small>TOTAL PROFIT</small><strong>{formatSpark(totalPlayer)}</strong></div><div><small>OPTIMAL CAPTURED</small><strong>{captured}%</strong></div></div><section className="final-chapters">{CAMPAIGN_MANIFEST.map((chapter) => {
    const chapterScores = scores.filter((score) => score.day.chapterId === chapter.id);
    const average = Math.round(chapterScores.reduce((sum, score) => sum + score.percent, 0) / Math.max(1, chapterScores.length));
    return <div key={chapter.id}><i style={{ background: chapter.color }}>{chapter.number}</i><span><b>{chapter.title}</b><small>{chapter.shortTitle}</small></span><strong>{gradeForPercent(average)}</strong><em>{average}%</em></div>;
  })}</section><div className="final-actions"><button onClick={() => window.print()}><Sparkles/> Save this scorecard</button><button onClick={onRestart}><RotateCcw/> New match</button></div><small className="screenshot-tip">Built to screenshot. Rae Current would absolutely post hers.</small></main>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [lastPlayScreen, setLastPlayScreen] = useState<Screen>('game');
  const [matchCode, setMatchCode] = useState(() => localStorage.getItem('gridville-code') || 'LONE-STAR');
  const [championship, setChampionship] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('gridville-muted') === 'true');
  const [progress, setProgress] = useState(() => Number(localStorage.getItem('gridville-progress') || 1));
  const [dayIndex, setDayIndex] = useState(0);
  const sequence = useMemo(() => buildSequence(matchCode), [matchCode]);
  const day = sequence[dayIndex];
  const [plan, setPlan] = useState<PlayerPlan>(() => emptyPlan(buildSequence('LONE-STAR')[0]));
  const [selectedId, setSelectedId] = useState(day.sites[0].id);
  const [solver, setSolver] = useState<SolverResult>();
  const [actual, setActual] = useState<number[]>(day.prices);
  const [solving, setSolving] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const sfx = useSynth(muted);

  const resetDay = (index: number) => {
    const nextDay = sequence[index];
    const chapter = chapterFor(nextDay);
    if (!isChapterAvailable(chapter)) return;
    setDayIndex(index); setPlan(emptyPlan(nextDay)); setSelectedId(nextDay.sites[0].id); setSolver(undefined); setActual(nextDay.prices); setScreen('game'); setLastPlayScreen('game');
    const nextProgress = Math.max(progress, chapter.number); setProgress(nextProgress); localStorage.setItem('gridville-progress', String(nextProgress));
  };
  const start = () => {
    localStorage.setItem('gridville-code', matchCode || 'OPEN-GRID');
    setScores([]); setProgress(Math.max(1, progress)); resetDay(0); sfx('place');
  };
  const finish = async () => {
    setSolving(true);
    try {
      const result = await solveDay(day);
      const settled = realizePrices(day);
      setSolver(result); setActual(settled); setScreen('result'); setLastPlayScreen('result');
    } catch (error) {
      console.error(error); window.alert('The solver tripped over a power cord. Your plan is safe—try locking again.');
    } finally { setSolving(false); }
  };
  const recordAndAdvance = () => {
    if (!solver) return;
    const playerScore = evaluatePlan(day, plan, actual).profit;
    const optimalScore = evaluateOptimalOnPrices(day, solver, actual);
    const percent = performancePercent(playerScore, optimalScore);
    const grade = gradeForPercent(percent);
    const bestKey = `gridville-best:${matchCode}:${day.id}`;
    const best = Math.max(percent, Number(localStorage.getItem(bestKey) || 0));
    localStorage.setItem(bestKey, String(best));
    setScores((current) => [...current, { day, player: playerScore, optimal: optimalScore, percent, grade, best }]);
    const nextDay = sequence[dayIndex + 1];
    if (!nextDay || nextDay.chapterId !== day.chapterId) { setScreen('chapter'); setLastPlayScreen('chapter'); }
    else resetDay(dayIndex + 1);
  };
  const continueChapter = () => {
    if (dayIndex >= sequence.length - 1) { setScreen('summary'); setLastPlayScreen('summary'); }
    else resetDay(dayIndex + 1);
  };
  const goGuide = () => { if (screen !== 'field-guide') setLastPlayScreen(screen); setScreen('field-guide'); };
  const toggleMute = () => { const next = !muted; setMuted(next); localStorage.setItem('gridville-muted', String(next)); };

  return <div className="app-shell">
    <header className="topbar"><button className="wordmark" onClick={() => setScreen('welcome')}><span><Zap/></span><b>GRIDVILLE</b><em>DISPATCH LAB</em></button><nav>{screen !== 'welcome' && <button onClick={() => setScreen(lastPlayScreen === 'field-guide' ? 'game' : lastPlayScreen)} className={screen !== 'field-guide' ? 'active' : ''}><Gauge/> Dispatch</button>}<button onClick={goGuide} className={screen === 'field-guide' ? 'active' : ''}><BookOpen/> Field guide</button><button onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Mute sound'} title={muted ? 'Turn synthesized game sounds on' : 'Mute synthesized game sounds'}>{muted ? <VolumeX/> : <Volume2/>}</button></nav></header>
    {screen === 'welcome' && <Welcome code={matchCode} setCode={setMatchCode} championship={championship} setChampionship={setChampionship} onStart={start}/>}
    {screen === 'game' && <GameScreen key={day.id} day={day} dayIndex={dayIndex} plan={plan} setPlan={setPlan} selectedId={selectedId} setSelectedId={setSelectedId} onDone={finish} solving={solving} sfx={sfx}/>}
    {screen === 'result' && solver && <ResultScreen day={day} plan={plan} solver={solver} actual={actual} selectedId={selectedId} championship={championship} finalDay={dayIndex === sequence.length - 1} onNext={recordAndAdvance} sfx={sfx}/>}
    {screen === 'chapter' && <ChapterSummary day={day} scores={scores} finalChapter={dayIndex === sequence.length - 1} onContinue={continueChapter}/>}
    {screen === 'field-guide' && <FieldGuide progress={progress}/>}
    {screen === 'summary' && <FinalSummary scores={scores} code={matchCode} onRestart={() => setScreen('welcome')}/>}
  </div>;
}
