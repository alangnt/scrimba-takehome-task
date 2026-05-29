# EduAnimate

AI-generated animated educational lessons, rendered live in the browser. Type any question, get a narrated, animated SVG explainer — no video files, no pre-rendered content.

---

## What it does

EduAnimate takes a free-form educational query and produces a fully animated, narrated 5-chapter lesson that plays inside the browser. Everything is generated on demand:

- **Script** — Claude Sonnet writes the narration, chapter titles, and a spatial storyboard
- **Visuals** — Claude Sonnet draws SVG scenes with GSAP animations (no MP4, no canvas pixel raster, no Sora/Runway)
- **Audio** — ElevenLabs TTS narrates each chapter in English or Norwegian

The output surface is a self-contained HTML document rendered inside an `<iframe>`. It responds to `postMessage` for play/pause/seek so the parent page stays in full control of playback.

---

## Demo queries

The three queries from the spec are pre-loaded as example pills on the home screen:

- *Why is the sky blue?*
- *How does the Norwegian parliament work?*
- *Hash map vs. B-tree*

---

## Setup

### Prerequisites

- Node.js 18+ or Bun
- An Anthropic API key
- An ElevenLabs API key

### Environment variables

Create a `.env.local` file at the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
```

### Install and run

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

### Generation pipeline

```
User query
    │
    ▼
[Director] — one Claude Sonnet call
    │  Returns a JSON storyboard:
    │  title, bg color, narrations ×5, chapter names ×5,
    │  element list (id, bounding box, description, connector flag),
    │  scene plans (enter / exit / move / beat per scene)
    │
    ├──▶ [Overlap resolver] — pure TS, no API call
    │       Iteratively pushes overlapping bounding boxes apart
    │       with a 28px gap, then clamps to canvas margins.
    │
    ▼
[Animators ×5] — five Claude Sonnet calls in parallel
    │  Each animator receives:
    │  • the full storyboard (for layout awareness)
    │  • its scene index + narration
    │  • explicit coordinate bounds per element  x:[min..max]  y:[min..max]
    │  • six luxury SVG component templates to copy from
    │  • a locked color palette derived from the director's background choice
    │  • the list of available GSAP animation primitives
    │
    │  Each returns two sections:
    │  @@@SVG  — <g> groups for elements introduced this scene
    │  @@@SCENE — JS object { show, hide, move, setup() } for the engine
    │
    ├──▶ [Critique pass] — if setup() has fewer than 2 animation calls,
    │       re-runs that animator once with an explicit "you were flat" prompt.
    │       Falls back to the original on failure.
    │
    ▼
[Assembly]
    │  • SVG groups joined into one document
    │  • ClipPath elements injected for every non-moving, non-connector element
    │  • SCENES array serialized as a JS constant
    │  • Pre-built ENGINE, CSS, and shared <defs> injected
    │  • Result: one self-contained HTML string (~40–80 KB)
    │
    ▼
Client receives  Lesson { title, narrations, chapters, frames, html }
    │
    ▼
[TTS — 5 parallel browser fetches]
    GET /api/tts?text=… for each narration
    Each streams audio/mpeg from ElevenLabs directly to the browser,
    accumulated into a Blob and stored as a blob:// URL.
    No base64. No server-side buffering.
    │
    ▼
Player — iframe + chapter nav + transport controls + continuous progress bar
```

### The animation engine

The engine is a pre-built JS string injected into every lesson. The model never regenerates it — it only writes SVG markup and the per-scene `setup()` call. This keeps token counts low and prevents the model from hallucinating helpers that don't exist.

| Primitive | What it does |
|-----------|-------------|
| `show(id)` / `hide(id)` | Fade in / out |
| `pop(id)` | Scale-from-zero entrance (max 1× per scene by rule) |
| `draw(id, dur, len)` | Stroke draw-on for arrows and paths |
| `flow(id, len, dur)` | Looping dashed stroke animation |
| `count(id, to, dur)` | Tween a `<text>` number from 0 → N |
| `pulse(id, scale, period)` | Looping heartbeat scale (max scale 1.03 by rule) |
| `orbit(id, radius, period)` | Looping circular motion |
| `recolor(id, color)` | Animate fill color |
| `typewrite(id, msPerChar)` | Character-by-character text reveal |
| `highlight(id)` | Brightness flash for emphasis |
| `shake(id)` | Horizontal shake for collisions / errors |
| `at(seconds, fn)` | Delayed call within a scene |
| `cam([tx, ty, scale])` | Glide the camera to frame the active scene |

`seekScene(idx)` sets `_fast = true` and replays every preceding scene at zero duration to reconstruct correct visual state, then plays the target scene normally. This makes chapter-jumping reliable regardless of what the model generated.

### Camera system

After all scenes are assembled, `computeFrames()` computes a per-scene `[tx, ty, scale]` camera transform. It takes the bounding union of all visible elements in that scene, adds padding, and fits the result within a 1.4× max zoom. The entire canvas is wrapped in `<g id="cam">` and the camera is animated with GSAP on every scene transition.

### Overlap prevention — two layers

**Layer 1 — storyboard level.** `resolveOverlaps()` is a deterministic iterative solver that runs after the director call and before any animator sees the layout. It pushes overlapping bounding boxes apart (28px minimum gap) and clamps them to the 1200×675 canvas margins.

**Layer 2 — render level.** After SVG generation, a regex pass adds `clip-path="url(#clip-{id})"` to every non-moving, non-connector `<g>` element, with matching `<clipPath><rect …/></clipPath>` elements injected into `<defs>`. This is a hard code-level guarantee: no SVG content can bleed outside its assigned box regardless of what the model drew. Two element categories are exempt:
- Elements in any scene's `move` map — their clip rect would stay at the original SVG coordinates as GSAP translates the group
- Elements marked `"connector": true` by the director — arrows and lines that intentionally span between nodes

### Language support

Passing `lang: 'no'` appends a Norwegian Bokmål instruction to both the director prompt and each animator prompt. ElevenLabs `eleven_turbo_v2_5` is multilingual and auto-detects language from the text, so no voice change is needed.

---

## What was hard to build

### 1. Getting the model to stay inside bounding boxes

The hardest problem by far. The director assigns each element a `{x, y, w, h}` box. The animators are told to draw inside it. They don't, reliably — SVG shapes, text, and filters regularly bleed into adjacent elements.

The solution required three independent layers:
- Showing coordinate bounds as pre-computed ranges in the prompt (`x:[200..270]` rather than `x:200, w:70` — the model doesn't reliably compute `x + w` when under generation pressure)
- The iterative storyboard-level overlap resolver
- Server-side `<clipPath>` injection as a hard render guarantee

Connector elements had to be explicitly opted out of clipping since they need to cross box boundaries by design. The director marks them with `"connector": true`.

### 2. SVG visual quality

Raw SVG generation defaults to flat, uninteresting output — opaque solid-colored rectangles with plain text. Getting polished results required:

- Six complete copy-paste-ready SVG component templates in the system prompt (card, node, hero node, pill, connector, stat row) — not descriptions, but actual markup with real coordinates
- A locked color palette injected per-generation to prevent scenes from clashing visually
- Hard mandatory quality rules: no opaque fills, 1px strokes only, `url(#glow)` on at most one element per scene, typography hierarchy required on every text-bearing element
- Pre-built shared `<defs>` (gradient fills, glow/shadow filters, arrowhead markers) the model references by id without redefining them — this alone eliminated a category of broken-looking output

### 3. Reliable seeking / chapter navigation

When a user clicks chapter 4, the engine needs to show exactly the right visual state — elements that entered in scenes 1–3 visible, exited elements hidden, moved elements at their final positions. A naive `goToScene(4)` would only apply scene 4's transitions, leaving the canvas in whatever state it was in.

The fix is `seekScene()`: it sets `_fast = true` (all GSAP durations → 0), replays scenes 0 through N-1 instantly, then plays scene N normally. Correct state, zero flicker.

### 4. Keeping generation fast

With 6 Claude calls, wall-clock time is dominated by the slowest animator. All 5 animator calls are `Promise.all`'d — total time is approximately one animator call, not five. The pre-built ENGINE, CSS, and `<defs>` are injected server-side, so the model only generates the variable SVG and scene objects. This keeps prompt sizes smaller and context more focused.

### 5. Audio delivery without base64 bloat

The naive approach — returning ElevenLabs audio as base64 data URLs from a Next.js server action — puts 3–5 MB of base64 into a single JSON response body. Instead, `/api/tts` is a streaming API route that pipes ElevenLabs' response directly to the browser. The client pre-fetches all 5 clips as Blobs, converts them to `blob://` URLs, and releases them via `URL.revokeObjectURL()` on reset. No server-side buffering, no encoding overhead.

### 6. Prompt decomposition

A single monolithic "generate the whole lesson" prompt produces mediocre results. The director/animator split separates concerns cleanly:

- The **director** focuses entirely on layout, spatial planning, narrative arc, and element sizing. It never writes SVG.
- Each **animator** focuses on one scene, has full layout context (all element bounding boxes across all scenes, for aiming arrows), and only writes SVG + a scene control object.

The critique pass adds a second attempt for scenes where the animator phoned in the animation — fewer than 2 primitive calls in `setup()` is a reliable signal of a flat scene.

---

## Project structure

```
app/
  page.tsx           Client — idle / loading / player UI, audio pre-fetch,
                     playback controls, quip animations, time-based progress bar
  actions.ts         Server — director prompt, animator prompts, generation pipeline,
                     SVG assembly, clipPath injection, camera framing, overlap resolver
  api/tts/route.ts   Server — streams ElevenLabs TTS directly to the browser
  globals.css        Tailwind base + keyframe animations (bounce-dot, glow-pulse, fade-up)
  layout.tsx         Root layout, page metadata
```

### Key constants in `actions.ts`

| Constant | Purpose |
|----------|---------|
| `ENGINE` | Pre-built GSAP runtime injected into every lesson iframe |
| `DEFS` | Shared SVG `<defs>`: glow/shadow filters, gradient fills, arrowhead markers |
| `CSS` | Minimal reset styles scoped to the lesson iframe |
| `DIRECTOR_PROMPT` | System prompt for the storyboard planning call |
| `PRIMITIVES_DOC` | Animation API reference injected into every animator system prompt |
| `STYLE_EXAMPLES` | Six luxury SVG component templates the animators are instructed to copy from |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Server Actions) |
| AI | Claude Sonnet 4.6 via Vercel AI SDK (`@ai-sdk/anthropic`) |
| Animation | GSAP 3.12 (CDN, inside the lesson iframe) |
| TTS | ElevenLabs `eleven_turbo_v2_5`, voice: Sarah (EXAVITQu4vr4xnSDxMaL) |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |
