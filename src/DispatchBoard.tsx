import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, LockKeyhole, Minus } from 'lucide-react';
import { hourLabel, pricesForSite, solverActionAt } from './logic';
import type { Action, DayData, HourFlow, PlayerPlan, Site, SolverResult } from './types';

export type BoardLessonTargets = { cheapHours: number[]; peakHour: number };

type DispatchBoardProps = {
  day: DayData;
  site: Site;
  actions: Action[];
  flows: HourFlow[];
  tool: Action;
  scrubHour: number;
  disabled: boolean;
  lessonTargets?: BoardLessonTargets;
  onPaint: (hour: number, action: Action) => void;
  onInspect: (hour: number) => void;
};

function actionName(action: Action): string {
  switch (action) {
    case -1: return 'Charge';
    case 0: return 'Idle';
    case 1: return 'Discharge';
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function actionClass(action: Action): string {
  switch (action) {
    case -1: return 'charge';
    case 0: return 'idle';
    case 1: return 'discharge';
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function ActionMark({ action }: { action: Action }) {
  switch (action) {
    case -1: return <ArrowDown aria-hidden="true"/>;
    case 0: return <Minus aria-hidden="true"/>;
    case 1: return <ArrowUp aria-hidden="true"/>;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function priceTone(price: number, min: number, max: number): string {
  const ratio = max === min ? .5 : (price - min) / (max - min);
  if (ratio < .34) return 'cheap';
  if (ratio > .67) return 'expensive';
  return 'middle';
}

function hourAt(event: ReactPointerEvent<HTMLDivElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.max(0, Math.min(23, Math.floor((event.clientX - rect.left) / rect.width * 24)));
}

export function HourlyDispatchBoard({ day, site, actions, flows, tool, scrubHour, disabled, lessonTargets, onPaint, onInspect }: DispatchBoardProps) {
  const prices = pricesForSite(day, site);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const dragging = useRef(false);
  const lastHour = useRef(-1);
  const [hoverHour, setHoverHour] = useState<number>();
  const visibleHour = hoverHour ?? scrubHour;
  const flow = flows[visibleHour] ?? { charge: 0, discharge: 0, soc: 0 };
  const apply = (hour: number) => {
    setHoverHour(hour);
    onInspect(hour);
    if (disabled || hour === lastHour.current) return;
    lastHour.current = hour;
    onPaint(hour, tool);
  };
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    lastHour.current = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <section className={`hourly-dispatch ${disabled ? 'disabled' : ''} ${lessonTargets ? 'has-lesson' : ''}`} aria-label={`${site.name} hourly battery dispatch`}>
    <div className="dispatch-readout" aria-live="polite">
      <span>HOUR {hourLabel(visibleHour)}</span><b>₷{prices[visibleHour].toFixed(1)} <small>/ kWh</small></b>
      <em className={actionClass(actions[visibleHour])}><ActionMark action={actions[visibleHour]}/> {actionName(actions[visibleHour])}</em>
      <strong>SOC <i>{flow.soc.toFixed(1)} / {site.capacity} kWh</i></strong>
    </div>
    {lessonTargets && <div className="lesson-ribbon" aria-hidden="true">{prices.map((_, hour) => <span key={hour} className={lessonTargets.cheapHours.includes(hour) ? 'cheap' : lessonTargets.peakHour === hour ? 'spike' : ''}>{lessonTargets.cheapHours.includes(hour) ? 'CHEAP' : lessonTargets.peakHour === hour ? 'SPIKE' : ''}</span>)}</div>}
    <div className="price-bars" aria-label="Price shape: shorter blue bars are cheaper, taller orange bars are more expensive">
      {prices.map((price, hour) => {
        const height = Math.max(9, ((price - min) / Math.max(1, max - min)) * 100);
        return <div className={`price-bar ${priceTone(price, min, max)}`} key={hour}><i style={{ height: `${height}%` }}/></div>;
      })}
    </div>
    <div className="hour-cells"
      onPointerDown={(event) => {
        if (disabled) return;
        dragging.current = true;
        lastHour.current = -1;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic events may not have a pointer to capture. */ }
        apply(hourAt(event));
      }}
      onPointerMove={(event) => {
        const hour = hourAt(event);
        setHoverHour(hour);
        onInspect(hour);
        if (dragging.current) apply(hour);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onPointerLeave={() => { if (!dragging.current) setHoverHour(undefined); }}>
      {prices.map((price, hour) => {
        const action = actions[hour];
        const event = day.demandResponse?.hour === hour ? day.demandResponse : undefined;
        const lessonLabel = lessonTargets?.cheapHours.includes(hour) ? 'CHEAP' : lessonTargets?.peakHour === hour ? 'SPIKE' : undefined;
        return <button key={hour} type="button" disabled={disabled} className={`hour-cell ${actionClass(action)} ${priceTone(price, min, max)} ${hoverHour === hour ? 'hovered' : ''} ${lessonLabel ? `lesson-${lessonLabel.toLowerCase()}` : ''}`}
          aria-label={`${hourLabel(hour)}, ₷${price.toFixed(1)} per kilowatt-hour, ${actionName(action)}${event ? `, hold for ${event.name}` : ''}`}
          onFocus={() => { setHoverHour(hour); onInspect(hour); }}
          onClick={(event) => { if (event.detail === 0) onPaint(hour, tool); }}>
          <small>{hourLabel(hour)}</small><b>₷{price.toFixed(1)}</b>
          {day.uncertainty[hour] > 0 && <span>±{day.uncertainty[hour].toFixed(0)}</span>}
          <i><ActionMark action={action}/></i>
          {lessonLabel && <em className="lesson-tag">{lessonLabel}</em>}
          {event && <em>HOLD +₷{event.rewardPerStoredKWh}</em>}
        </button>;
      })}
    </div>
    {disabled && <div className="dispatch-curtain"><b>Choose a glowing home</b><span>Then write its schedule directly on these numbered hours.</span></div>}
  </section>;
}

export function DispatchShowdown({ day, site, plan, solver, actual, hidden }: { day: DayData; site: Site; plan: PlayerPlan; solver: SolverResult; actual: number[]; hidden: boolean }) {
  const prices = pricesForSite(day, site, actual);
  const playerActions = plan[site.id]?.actions ?? Array.from({ length: 24 }, (): Action => 0);
  const solverPlan = solver.plans.find((candidate) => candidate.siteId === site.id);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return <section className="dispatch-showdown" aria-label={`Numbered dispatch showdown for ${site.name}`}>
    <header><div><small>NUMBERED SETTLEMENT STRIP · {site.name}</small><b>Every hour, side by side</b></div><div className="showdown-key"><span><i className="you"/> You</span><span><i className="highs"/> HiGHS</span></div></header>
    <div className="showdown-hours">
      {prices.map((price, hour) => {
        const playerAction = playerActions[hour];
        const solverAction = solverActionAt(solverPlan, hour);
        return <div className={`showdown-hour ${priceTone(price, min, max)}`} key={hour}>
          <small>{hourLabel(hour)}</small><b>₷{price.toFixed(1)}</b>
          <span className={`showdown-action you ${actionClass(playerAction)}`}><ActionMark action={playerAction}/><span className="sr-only">You: {actionName(playerAction)}</span></span>
          <span className={`showdown-action highs ${hidden ? 'sealed' : actionClass(solverAction)}`}>{hidden ? <><LockKeyhole aria-hidden="true"/><span className="sr-only">HiGHS schedule sealed</span></> : <><ActionMark action={solverAction}/><span className="sr-only">HiGHS: {actionName(solverAction)}</span></>}</span>
        </div>;
      })}
    </div>
    {hidden && <p><LockKeyhole/> Championship mode seals HiGHS’s site and hour choices. The benchmark score still counts.</p>}
  </section>;
}
