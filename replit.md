# Synapset

## Overview

**Synapset** — "Don't just study. Connect." — is a full-stack AI-powered study platform built around the Ebbinghaus forgetting curve and cognitive science principles.

## Architecture

pnpm workspace monorepo with TypeScript.

- **Frontend**: React + Vite + Tailwind CSS (artifacts/synapset) — dark mode, electric blue + violet neuron aesthetic
- **Backend**: Node.js + Express 5 (artifacts/api-server) — REST API
- **Database**: PostgreSQL + Drizzle ORM (lib/db)
- **AI**: Claude (claude-sonnet-4-6) via Replit AI Integrations (lib/integrations-anthropic-ai)
- **API Contract**: OpenAPI spec (lib/api-spec/openapi.yaml) → Orval codegen → React Query hooks + Zod schemas

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Features

1. **Dashboard ("Your Brain Map")** — Live forgetting curves (R = e^(-t/S)), subject retention cards with green→yellow→red coloring, urgent "Revise Now" cards with pulsing animation, XP + streak gamification
2. **Study Logger ("Feed Your Synapse")** — Log topics, duration, difficulty. Auto-schedules revisions at 1d/3d/7d/14d/30d intervals
3. **Claude AI Coach ("Synapset Coach")** — Persistent chat sidebar fed full context (retention scores, revision history, focus data). Flashcard generation, strategy recommendations
4. **Focus Tracker ("Deep Work Mode")** — Pomodoro timer (25/5 cycles), Camera Assist toggle with privacy notice, weekly focus heatmap
5. **Air Drawing ("Trace to Remember")** — HTML5 Canvas for motor-memory drawing, save drawings linked to topics
6. **Brain Break ("Synapse Reset")** — Blink sync challenge with animated pulsing circle, scoring, neuron badge reward

## Database Schema

- users(id, name, email, xp, streak, level)
- study_sessions(id, user_id, topic, duration, difficulty, notes, created_at)
- revision_schedule(id, session_id, next_revision, completed, retention_score)
- focus_sessions(id, user_id, duration, focus_consistency_score, timestamp)
- brain_breaks(id, user_id, blink_score, timestamp)
- air_drawings(id, user_id, topic_linked, image_url, timestamp)

## Pages

- / → Landing page with neural network particle animation
- /dashboard → Brain Map with live forgetting curves
- /log → Study session logger
- /coach → AI Coach chat
- /focus → Pomodoro + focus heatmap
- /air-draw → Air drawing canvas
- /break → Blink sync brain break game

## Routes

- GET/PUT /api/users/me
- GET/POST /api/study-sessions, GET/DELETE /api/study-sessions/:id
- GET /api/revisions, POST /api/revisions/:id/complete
- GET/POST /api/focus-sessions
- GET/POST /api/brain-breaks
- GET/POST /api/air-drawings
- POST /api/coach/chat
- GET /api/dashboard/summary
- GET /api/dashboard/retention-curve/:sessionId
- GET /api/dashboard/focus-heatmap
- GET /api/dashboard/urgent-revisions

## Notes

- Demo user (id=1) is auto-created on first API call
- Retention formula: R = e^(-t/S), where S = stability factor derived from difficulty
- All camera processing is client-local — no video stored
- Codegen script patches api-zod/src/index.ts to avoid duplicate export conflict
