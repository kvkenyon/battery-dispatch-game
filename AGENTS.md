# Project guide

- `src/data.ts` is authoritative for seeded day and site generation.
- `src/logic.ts` owns player dispatch feasibility and accounting; `src/solver.ts` owns the equivalent HiGHS LP model. Keep their efficiency, degradation, and start/end-SOC rules aligned.
- Verify changes with `npm test` and `npm run build`. Browser QA should use the production-like Vite preview under the configured `/battery-dispatch-game/` base.
- Gridville's text, artwork, data, and UI should remain original; do not import third-party game assets or prose.

## Maintaining this file

Keep this file focused on durable project-wide guidance. Prefer pointers to authoritative code or commands over duplicating details that may drift.
