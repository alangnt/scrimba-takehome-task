"use server"

import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export interface Lesson {
  title: string;
  narrations: string[];
  chapters: string[];          // short chapter title per scene
  frames: number[][];          // per-scene camera framing [tx, ty, scale]
  html: string;
}

// ── Pre-built pieces injected server-side. The model never re-emits these,
//    which is what keeps generation fast: it only writes the variable parts. ──

const ENGINE = `
let _scene=-1,_timers=[],_fast=false,_init=null;
const $=id=>document.getElementById(id);
gsap.defaults({transformOrigin:'50% 50%'});
const D=d=>_fast?0:d;
const mv=(id,dx,dy)=>{const e=$(id);if(e)gsap.to(e,{x:dx,y:dy,duration:D(.7),ease:'power2.inOut'})};
const show=(id,d)=>{const e=$(id);if(e)gsap.to(e,{opacity:1,duration:D(d||.45),ease:'sine.out'})};
const hide=(id,d)=>{const e=$(id);if(e)gsap.to(e,{opacity:0,duration:D(d||.3),ease:'sine.in'})};
const recolor=(id,c)=>{const e=$(id);if(e)gsap.to(e,{fill:c,duration:D(.4)})};
const pulse=(id,s,p)=>{const e=$(id);if(e)gsap.to(e,{scale:s||1.04,duration:(p||3)/2,repeat:-1,yoyo:true,ease:'sine.inOut'})};
const orbit=(id,r,p)=>{const e=$(id);if(e)gsap.to(e,{rotation:360,duration:p||5,repeat:-1,ease:'none',transformOrigin:'-'+(r||70)+'px 50%'})};
const flow=(id,len,p)=>{const e=$(id);if(e){gsap.set(e,{strokeDasharray:len||300});gsap.fromTo(e,{strokeDashoffset:len||300},{strokeDashoffset:0,duration:p||2.4,repeat:-1,ease:'none'})}};
const pop=(id,d)=>{const e=$(id);if(e)gsap.fromTo(e,{scale:.95,opacity:0},{scale:1,opacity:1,duration:D(d||.45),ease:'power2.out'})};
const draw=(id,d,len)=>{const e=$(id);if(e){gsap.set(e,{opacity:1,strokeDasharray:len||400});gsap.fromTo(e,{strokeDashoffset:len||400},{strokeDashoffset:0,duration:D(d||1.5),ease:'power1.inOut'})}};
const count=(id,to,d)=>{const e=$(id);if(e){gsap.set(e,{opacity:1});const o={v:0};gsap.to(o,{v:to,duration:D(d||1.5),ease:'power1.out',onUpdate:()=>{e.textContent=Math.round(o.v)}})}};
const stopAnim=id=>{const e=$(id);if(e)gsap.killTweensOf(e)};
const at=(t,fn)=>{if(_fast){fn();return}const id=setTimeout(fn,t*1e3);_timers.push(id);return id};
const typewrite=(id,spd)=>{const e=$(id);if(!e)return;if(_fast){gsap.set(e,{opacity:1});return;}const t=e.textContent||'';e.textContent='';gsap.set(e,{opacity:1});let i=0;const step=()=>{if(i<=t.length){e.textContent=t.slice(0,i++);const tid=setTimeout(step,spd||42);_timers.push(tid)}};step()};
const highlight=(id)=>{const e=$(id);if(e)gsap.fromTo(e,{filter:'brightness(1)'},{filter:'brightness(2.6)',duration:D(.15),yoyo:true,repeat:1,ease:'power2.inOut'})};
const shake=(id)=>{const e=$(id);if(e)gsap.to(e,{keyframes:[{x:5,duration:.07},{x:-5,duration:.07},{x:3,duration:.06},{x:-3,duration:.06},{x:0,duration:.05}],ease:'none'})};
// Camera: glide the whole canvas to frame the active scene [tx, ty, scale]
const cam=t=>{const g=$('cam');if(!g||!t)return;gsap.to(g,{x:t[0],y:t[1],scale:t[2],transformOrigin:'0 0',duration:_fast?0:0.65,ease:'power2.inOut'})};

// Snapshot each group's authored visibility at load, so we can rebuild from scratch
function snap(){_init={};document.querySelectorAll('g[id]').forEach(e=>{_init[e.id]=getComputedStyle(e).opacity})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',snap);else snap();
function resetAll(){
  if(!_init)snap();
  _timers.forEach(clearTimeout);_timers=[];
  document.querySelectorAll('g[id]').forEach(e=>{gsap.killTweensOf(e);gsap.set(e,{clearProps:'transform,filter'});e.style.opacity=_init[e.id]});
}

function goToScene(idx){
  if(idx<0||idx>=SCENES.length)return;
  _timers.forEach(clearTimeout);_timers=[];
  const s=SCENES[idx];
  // Staggered entrance for a polished scene transition (instant when seeking)
  (s.show||[]).forEach((id,i)=>{const e=$(id);if(e)gsap.to(e,{opacity:1,duration:D(.4),delay:_fast?0:i*.04,ease:'sine.out'})});
  (s.hide||[]).forEach(id=>hide(id));
  Object.entries(s.move||{}).forEach(([id,d])=>mv(id,d[0],d[1]));
  if(s.setup)at(.35,s.setup);
  _scene=idx;
}

// Jump anywhere: reset, instantly replay every scene up to target, then play target normally
function seekScene(idx){
  if(idx<0||idx>=SCENES.length)return;
  resetAll();
  _fast=true;
  for(let i=0;i<idx;i++)goToScene(i);
  _fast=false;
  goToScene(idx);
}

window.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type==='goto'){gsap.globalTimeline.resume();goToScene(d.index);cam(d.cam)}
  else if(d.type==='seek'){gsap.globalTimeline.resume();seekScene(d.index);cam(d.cam)}
  else if(d.type==='pause')gsap.globalTimeline.pause();
  else if(d.type==='resume')gsap.globalTimeline.resume();
});
`;

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
svg{display:block;width:100%;height:100%}
text{font-family:'Segoe UI',system-ui,sans-serif;pointer-events:none}
`;

// Shared <defs> the model references by id but never has to write.
const DEFS = `
  <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="white"/></marker>
  <marker id="ahb" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#60a5fa"/></marker>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glow-lg" x="-75%" y="-75%" width="250%" height="250%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/></filter>
  <linearGradient id="grad-blue" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient>
  <linearGradient id="grad-card" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="rgba(99,102,241,0.22)"/><stop offset="100%" stop-color="rgba(99,102,241,0.04)"/></linearGradient>
  <linearGradient id="grad-green" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#34d399"/></linearGradient>
  <linearGradient id="grad-warm" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fb923c"/></linearGradient>
`;

// Assemble the final self-contained document from our pieces + the model's variable parts.
function assembleHtml(svgBody: string, scenes: string, bg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<style>${CSS}</style>
<script>${ENGINE}</script>
</head>
<body style="background:${bg}">
<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
<defs>${DEFS}</defs>
<g id="cam">
${svgBody}
</g>
</svg>
<script>const SCENES=${scenes};</script>
</body></html>`;
}

// ── Parallel generation: one fast "director" plans the whole piece, then five
//    "animators" draw their scene concurrently. Cuts wall-clock to ~one scene. ──

interface SceneElement {
  id: string;
  introScene: number;      // scene index (0-based) where this element first appears
  x: number;               // bounding-box TOP-LEFT on the 800×450 canvas
  y: number;
  w: number;               // bounding-box width  — the element must be drawn inside this box
  h: number;               // bounding-box height
  desc: string;            // what it is + how it should look
}
interface ScenePlan {
  enter: string[];                       // element ids appearing this scene
  exit: string[];                        // element ids leaving this scene
  move: Record<string, [number, number]>; // element id → [dx, dy] delta from base
  beat: string;                          // what happens + what should animate
}
interface Storyboard {
  title: string;
  bg: string;
  narrations: string[];
  chapters: string[];          // short 2–4 word chapter title per scene
  elements: SceneElement[];
  scenes: ScenePlan[];
}

const DIRECTOR_PROMPT = `You are the director AND layout artist of a continuous 5-scene animated educational explainer. A separate animator draws each element to fit EXACTLY inside the bounding box you assign it, so your single most important job is a clean, NON-OVERLAPPING spatial layout. A cramped or colliding layout is a failure.

CANVAS: 800×450 SVG units. Treat (0,0) as top-left. Keep a 24px margin on all sides (usable area ≈ 24..776 × 24..426).

Return STRICT JSON only (no markdown, no comments, no trailing commas):
{
  "title": "concise lesson title",
  "bg": "#0a1628",
  "narrations": ["scene 1", "scene 2", "scene 3", "scene 4", "scene 5"],
  "chapters": ["The Setup", "First Clue", "...", "...", "The Payoff"],
  "elements": [
    { "id": "kebab-case-id", "introScene": 0, "x": 60, "y": 180, "w": 180, "h": 90, "desc": "what it is + visual style: shapes, color, label, whether it glows or casts a shadow" }
  ],
  "scenes": [
    { "enter": ["id"], "exit": ["id"], "move": { "id": [120, -40] }, "beat": "what happens this scene and what should animate — pulse, draw arrows, count numbers up, recolor, orbit, typewrite a label, highlight key elements, shake on collision/error, etc." }
  ]
}

LAYOUT RULES (most important):
- Every element has a bounding box {x, y, w, h} = top-left corner + size. The animator draws strictly inside it.
- Boxes of elements that are VISIBLE AT THE SAME TIME must NOT overlap and must leave ≥16px gaps. Mentally place each box and verify no two on-screen-together boxes intersect.
- At most 6 elements visible in any single scene. Use "exit" to clear elements that are no longer needed BEFORE the scene gets crowded — favour a focused composition over keeping everything on screen.
- Choose a composition that suits the concept: side-by-side halves for a comparison (left ≈ x 40..390, right ≈ x 410..760); top-down levels for a tree/hierarchy; left-to-right stages for a process/pipeline; orbit/center for a system.
- Realistic sizes: a short label/pill ≈ 130×46, a titled card ≈ 200×130, a big focal panel ≈ 320×150, an icon ≈ 70×70. Text must fit its box.
- move deltas are pixels from the box's position; after moving, the box must still be on-canvas and not collide with other on-screen boxes.

CONTENT RULES:
- EXACTLY 5 narrations, 5 chapters and 5 scenes. Narrations: conversational and vivid, a hook in scene 1, a payoff in scene 5, ~1–2 sentences each.
- chapters: a punchy 2–4 word title for each scene, like documentary chapter cards (e.g. "Down the Rabbit Hole", "When Things Collide").
- 8–12 elements total. Each element's introScene is the scene it first enters; that scene's "enter" array must include it.
- ≥3 elements persist across 2+ scenes and MOVE (shared elements drifting = the "video" feel). Pick one hero element that travels across the canvas over the 5 scenes.
- Illustrate the concept literally and meaningfully — never abstract decoration.
Return ONLY the JSON object.`;

const PRIMITIVES_DOC = `  show(id) / hide(id)        — fade in / out
  pop(id)                    — punchy scale-from-zero entrance (use for emphasis instead of show)
  draw(id, dur, len)         — draw a path/line on once and keep it (arrows, graphs, outlines)
  flow(id, len, dur)         — continuous looping dash flow along a stroke
  count(id, to, dur)         — tween a <text> number 0 → to (stats / data)
  pulse(id, scale, period)   — looping heartbeat scale
  orbit(id, radius, period)  — looping circular motion
  recolor(id, color)         — animate fill color (state changes)
  stopAnim(id)               — stop an element's looping animation
  typewrite(id, mspChar)     — character-by-character text reveal (great for code / labels)
  highlight(id)              — brief brightness flash for emphasis (use on key reveal moments)
  shake(id)                  — horizontal shake (collisions, errors, surprises)
  at(seconds, fn)            — schedule a staggered call later within the scene`;

const STYLE_EXAMPLES = `
STYLE REFERENCE — aim for this quality level (coordinates are relative to each element's box origin):

Glowing hero node (70×70 box):
  <circle cx="35" cy="35" r="28" fill="url(#grad-blue)" filter="url(#glow-lg)"/>

Gradient card with label (200×130 box):
  <rect width="200" height="130" rx="14" fill="url(#grad-card)" stroke="rgba(99,102,241,0.35)" stroke-width="1" filter="url(#shadow)"/>
  <text x="16" y="26" font-size="10" font-weight="700" letter-spacing="1.2" fill="#a5b4fc">CATEGORY</text>
  <text x="16" y="50" font-size="15" font-weight="600" fill="#f1f5f9">Main Label</text>
  <text x="16" y="70" font-size="11" fill="#64748b">Supporting detail</text>

Pill / badge (130×40 box):
  <rect width="130" height="40" rx="20" fill="rgba(99,102,241,0.15)" stroke="rgba(99,102,241,0.5)" stroke-width="1"/>
  <text x="65" y="25" text-anchor="middle" font-size="12" font-weight="600" fill="#a5b4fc">LABEL</text>

Connector arrow between two boxes:
  <line x1="SRC_X" y1="SRC_Y" x2="DST_X" y2="DST_Y" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" marker-end="url(#ah)"/>
  <line ... stroke="#60a5fa" stroke-width="2" stroke-dasharray="6 3" marker-end="url(#ahb)"/>  (blue dashed variant)`;

function animatorSystem(sb: Storyboard, i: number): string {
  const introHere = sb.elements.filter(e => e.introScene === i);
  const plan = sb.scenes[i];
  const boxLines = introHere
    .map(e => `  • #${e.id} — box x:${e.x} y:${e.y} w:${e.w} h:${e.h} — ${e.desc}`)
    .join('\n') || '  (none this scene)';

  const palette = `
PALETTE (stay strictly within this — no other colors):
  bg:       ${sb.bg}
  surface:  rgba(255,255,255,0.06)   — cards, panels
  accent:   #6366f1                  — primary (indigo)
  bright:   #a5b4fc                  — labels, highlights on accent
  success:  #10b981                  — positive / "correct" state
  warning:  #f59e0b                  — caution / notable
  text-hi:  #f1f5f9                  — primary readable text
  text-lo:  #64748b                  — secondary / muted text
  stroke:   rgba(255,255,255,0.12)   — borders, grid lines`;

  return `You are an SVG motion designer drawing ONE scene of a 5-scene animated explainer. The HTML document, CSS, animation engine and shared <defs> are all provided — you output ONLY this scene's new SVG element groups and its scene-control object.

CANVAS: 800×450 viewBox. Wrap every element in <g id="..."> with style="opacity:0" (the scene logic fades it in).

CRITICAL — STAY IN YOUR BOX: each element below has an assigned bounding box {x, y, w, h} (top-left + size). Draw ALL of that element's shapes and text strictly INSIDE its box — nothing may extend past it, or scenes will collide. Size text to fit the box width; wrap long labels onto multiple <text> lines or shorten them. The box position is the element's base for animation.
${palette}
${STYLE_EXAMPLES}

PROVIDED <defs> (reference by id, never redefine):
  Markers:   url(#ah) white arrowhead, url(#ahb) blue arrowhead
  Filters:   url(#glow) soft neon, url(#glow-lg) stronger neon — use on hero/focal elements
             url(#shadow) soft depth on solid cards/panels
  Gradients: url(#grad-blue) indigo→violet, url(#grad-card) subtle indigo card bg,
             url(#grad-green) emerald, url(#grad-warm) amber→orange
  You MAY add your OWN gradients in a single <defs>…</defs> at the very top of @@@SVG.

ANIMATION PRIMITIVES (call inside setup):
${PRIMITIVES_DOC}

FULL LAYOUT (every element's id + box, for aiming arrows and avoiding overlap):
${JSON.stringify(sb.elements.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h })))}

YOU ARE DRAWING SCENE ${i + 1} OF 5.
Narration spoken over this scene (match its length/feel): "${sb.narrations[i] ?? ''}"
Scene plan:
  enter: ${JSON.stringify(plan?.enter ?? [])}
  exit:  ${JSON.stringify(plan?.exit ?? [])}
  move:  ${JSON.stringify(plan?.move ?? {})}
  beat:  "${plan?.beat ?? ''}"

YOUR OUTPUT — EXACTLY these two sections, no markdown, no code fences:

@@@SVG
Draw rich <g id="..."> groups ONLY for the elements first introduced in THIS scene, each strictly inside its box:
${boxLines}
Apply gradients, glow/shadow filters, and sharp text labels. If this scene introduces no new elements, leave this section empty.

@@@SCENE
A single JavaScript object literal (starts with { — no "const", no trailing semicolon):
{
  show: [...],   // the "enter" ids above
  hide: [...],   // the "exit" ids above
  move: {...},   // the "move" map above
  setup: () => { /* realize the beat with ≥3 primitives: stagger with at(); pop() 1–2 elements for punch; draw()/flow() connections; count() numbers; typewrite() labels; highlight() on key reveals; pulse()/orbit() for continuous life */ }
}
Use only element ids that exist in the storyboard.`;
}

// Pull the contents of one @@@SECTION out of a model response.
function section(text: string, name: string): string {
  const m = text.match(new RegExp('@@@' + name + '[^\\n]*\\n([\\s\\S]*?)(?=\\n@@@|$)'));
  return m ? m[1].trim() : '';
}

function stripFences(s: string): string {
  return s.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
}

// Deterministic safety net (pure compute, no API call): push apart any boxes that
// are visible in the same scene but overlap, so the animators get a clean layout.
function resolveOverlaps(sb: Storyboard): void {
  const byId = new Map(sb.elements.map(e => [e.id, e]));
  // Which elements are on screen during each scene (cumulative enter/exit).
  const visible = new Set<string>();
  const conflicts = new Set<string>();
  for (const sc of sb.scenes) {
    (sc.enter ?? []).forEach(id => visible.add(id));
    (sc.exit ?? []).forEach(id => visible.delete(id));
    const ids = [...visible].filter(id => byId.has(id));
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++)
        conflicts.add([ids[a], ids[b]].sort().join('|'));
  }
  const pairs = [...conflicts].map(p => p.split('|') as [string, string]);

  const GAP = 18, MINX = 24, MINY = 24, MAXX = 776, MAXY = 426;
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (const [ia, ib] of pairs) {
      const a = byId.get(ia)!, b = byId.get(ib)!;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); // x penetration
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); // y penetration
      if (ox <= -GAP || oy <= -GAP) continue; // already clear with a gap
      moved = true;
      if (ox < oy) {
        const push = (ox + GAP) / 2;
        const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? 1 : -1;
        a.x -= dir * push; b.x += dir * push;
      } else {
        const push = (oy + GAP) / 2;
        const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? 1 : -1;
        a.y -= dir * push; b.y += dir * push;
      }
    }
    for (const e of sb.elements) {
      e.x = Math.round(Math.max(MINX, Math.min(e.x, MAXX - e.w)));
      e.y = Math.round(Math.max(MINY, Math.min(e.y, MAXY - e.h)));
    }
    if (!moved) break;
  }
}

async function direct(query: string): Promise<Storyboard> {
  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: DIRECTOR_PROMPT,
    prompt: `Plan an animated educational explainer about: "${query}"`,
  });
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const sb = JSON.parse(json) as Storyboard;
  if (!sb.narrations?.length || !sb.scenes?.length || !sb.elements?.length) {
    throw new Error('Director returned an incomplete storyboard');
  }
  resolveOverlaps(sb);
  return sb;
}

// A minimal but valid scene built straight from the director's plan — used when
// an animator misbehaves, so one bad call degrades that scene instead of the whole lesson.
function fallbackScene(plan: ScenePlan): string {
  return JSON.stringify({ show: plan?.enter ?? [], hide: plan?.exit ?? [], move: plan?.move ?? {} });
}

function countAnimCalls(scene: string): number {
  return (scene.match(/\b(pop|draw|count|pulse|orbit|flow|recolor|typewrite|highlight|shake|at)\s*\(/g) ?? []).length;
}

async function animateScene(sb: Storyboard, i: number): Promise<{ svg: string; scene: string }> {
  const run = async () => {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: animatorSystem(sb, i),
      prompt: `Draw scene ${i + 1}.`,
    });
    const svg = stripFences(section(text, 'SVG'));
    const scene = stripFences(section(text, 'SCENE')).replace(/;\s*$/, '').trim();
    if (!scene.startsWith('{')) throw new Error('no valid scene object');
    return { svg, scene };
  };

  try {
    const result = await run();

    // Critique pass: if the setup is sparse (< 2 primitive calls), re-run once with
    // a richer directive. The fallback keeps the original if the re-run also fails.
    if (countAnimCalls(result.scene) < 2) {
      try {
        const { text } = await generateText({
          model: anthropic('claude-sonnet-4-6'),
          system: animatorSystem(sb, i),
          prompt: `Draw scene ${i + 1}. The previous attempt was visually flat — use at least 4 animation primitives in setup: stagger reveals with at(), pop() entering elements, add a continuous loop (pulse/orbit/flow), and typewrite or highlight the key element.`,
        });
        const svg2 = stripFences(section(text, 'SVG'));
        const scene2 = stripFences(section(text, 'SCENE')).replace(/;\s*$/, '').trim();
        if (scene2.startsWith('{') && countAnimCalls(scene2) >= 2) {
          return { svg: svg2 || result.svg, scene: scene2 };
        }
      } catch { /* keep original */ }
    }

    return result;
  } catch {
    // Keep the lesson playable: still reveal/move whatever the storyboard planned.
    return { svg: '', scene: fallbackScene(sb.scenes[i]) };
  }
}

// Per-scene camera framing (pure compute): frame the elements visible in each
// scene with padding and a gentle zoom, so the "lens" follows the action.
function computeFrames(sb: Storyboard): number[][] {
  const pos = new Map(sb.elements.map(e => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h }]));
  const visible = new Set<string>();
  const frames: number[][] = [];
  const PAD = 70, MAXZOOM = 1.4;

  for (const sc of sb.scenes) {
    (sc.enter ?? []).forEach(id => visible.add(id));
    (sc.exit ?? []).forEach(id => visible.delete(id));
    Object.entries(sc.move ?? {}).forEach(([id, d]) => {
      const p = pos.get(id);
      if (p) { p.x += d[0]; p.y += d[1]; }
    });

    const boxes = [...visible].map(id => pos.get(id)).filter(Boolean) as { x: number; y: number; w: number; h: number }[];
    if (!boxes.length) { frames.push([0, 0, 1]); continue; }

    const minx = Math.min(...boxes.map(b => b.x)) - PAD;
    const miny = Math.min(...boxes.map(b => b.y)) - PAD;
    const maxx = Math.max(...boxes.map(b => b.x + b.w)) + PAD;
    const maxy = Math.max(...boxes.map(b => b.y + b.h)) + PAD;

    const s = Math.max(1, Math.min(MAXZOOM, Math.min(800 / (maxx - minx), 450 / (maxy - miny))));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const tx = Math.max(800 - 800 * s, Math.min(0, 400 - s * cx));
    const ty = Math.max(450 - 450 * s, Math.min(0, 225 - s * cy));
    frames.push([Math.round(tx), Math.round(ty), +s.toFixed(3)]);
  }
  return frames;
}

export async function generateLesson(query: string): Promise<Lesson> {
  const sb = await direct(query);
  const parts = await Promise.all(sb.scenes.map((_, i) => animateScene(sb, i)));

  const svgBody = parts.map(p => p.svg).filter(Boolean).join('\n');
  const scenesText = '[\n' + parts.map(p => p.scene).join(',\n') + '\n]';
  const bg = sb.bg?.startsWith('#') ? sb.bg : '#0a0a1e';
  const chapters = sb.chapters?.length === sb.scenes.length
    ? sb.chapters
    : sb.scenes.map((_, i) => `Chapter ${i + 1}`);

  return {
    title: sb.title || 'Lesson',
    narrations: sb.narrations,
    chapters,
    frames: computeFrames(sb),
    html: assembleHtml(svgBody, scenesText, bg),
  };
}
