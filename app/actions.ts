"use server"

import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import OpenAI from 'openai';

export interface Lesson {
  title: string;
  narrations: string[];
  html: string;
}

// Pre-built engine — embedded verbatim in the generated HTML.
// GSAP is the execution layer; the LLM only ever calls these primitives.
// Scenes are driven by the parent frame via postMessage {type:'goto', index}.
const ENGINE = `
let _scene=-1,_timers=[];
const $=id=>document.getElementById(id);
gsap.defaults({transformOrigin:'50% 50%'});
const mv=(id,dx,dy)=>{const e=$(id);if(e)gsap.to(e,{x:dx,y:dy,duration:.9,ease:'back.out(1.4)'})};
const show=(id,d)=>{const e=$(id);if(e)gsap.to(e,{opacity:1,duration:d||.55,ease:'power2.out'})};
const hide=(id,d)=>{const e=$(id);if(e)gsap.to(e,{opacity:0,duration:d||.4,ease:'power2.in'})};
const recolor=(id,c)=>{const e=$(id);if(e)gsap.to(e,{fill:c,duration:.5})};
const pulse=(id,s,p)=>{const e=$(id);if(e)gsap.to(e,{scale:s||1.15,duration:(p||1.6)/2,repeat:-1,yoyo:true,ease:'sine.inOut'})};
const orbit=(id,r,p)=>{const e=$(id);if(e)gsap.to(e,{rotation:360,duration:p||3,repeat:-1,ease:'none',transformOrigin:'-'+(r||70)+'px 50%'})};
const flow=(id,len,p)=>{const e=$(id);if(e){gsap.set(e,{strokeDasharray:len||300});gsap.fromTo(e,{strokeDashoffset:len||300},{strokeDashoffset:0,duration:p||2,repeat:-1,ease:'none'})}};
const pop=(id,d)=>{const e=$(id);if(e)gsap.fromTo(e,{scale:0,opacity:1},{scale:1,duration:d||.6,ease:'back.out(1.7)'})};
const draw=(id,d,len)=>{const e=$(id);if(e){gsap.set(e,{opacity:1,strokeDasharray:len||400});gsap.fromTo(e,{strokeDashoffset:len||400},{strokeDashoffset:0,duration:d||1.5,ease:'power1.inOut'})}};
const count=(id,to,d)=>{const e=$(id);if(e){gsap.set(e,{opacity:1});const o={v:0};gsap.to(o,{v:to,duration:d||1.5,ease:'power1.out',onUpdate:()=>{e.textContent=Math.round(o.v)}})}};
const stopAnim=id=>{const e=$(id);if(e)gsap.killTweensOf(e)};
const at=(t,fn)=>{const id=setTimeout(fn,t*1e3);_timers.push(id);return id};

function goToScene(idx){
  if(idx>=SCENES.length)return;
  _timers.forEach(clearTimeout);_timers=[];
  const s=SCENES[idx];
  // Staggered entrance for a polished scene transition
  (s.show||[]).forEach((id,i)=>{const e=$(id);if(e)gsap.to(e,{opacity:1,duration:.55,delay:i*.08,ease:'power2.out'})});
  (s.hide||[]).forEach(id=>hide(id));
  Object.entries(s.move||{}).forEach(([id,d])=>mv(id,d[0],d[1]));
  if(s.setup)at(.35,s.setup);
  _scene=idx;
}

window.addEventListener('message',e=>{if(e.data?.type==='goto')goToScene(e.data.index);});
`;

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{width:800px;height:450px;overflow:hidden}
svg{display:block;width:800px;height:450px}
text{font-family:'Segoe UI',system-ui,sans-serif;pointer-events:none}
`;

const SYSTEM_PROMPT = `You are a world-class educational animator. You generate a single self-contained HTML animation — one continuous "video" where elements persist across all 5 scenes, moving and morphing rather than disappearing and being replaced.

PHILOSOPHY: Think documentary, not slideshow. Elements introduced in scene 1 remain on canvas through scene 5, drifting to new positions, changing color, growing/shrinking. New elements slide in from the edges. Old ones fade to the periphery. The result feels like watching an animated explainer video.

OUTPUT FORMAT — return only valid JSON:
{"title":"...","narrations":["scene 1 narration","scene 2 narration","scene 3 narration","scene 4 narration","scene 5 narration"],"html":"<!DOCTYPE html>..."}

The narrations array must have exactly 5 strings — one per scene. Audio is handled externally; do NOT use speechSynthesis in the HTML.

══════════════════════════════════
HTML STRUCTURE TO FOLLOW EXACTLY
══════════════════════════════════

<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"><\/script>
<style>
CSS_PLACEHOLDER
</style>
<script>ENGINE_PLACEHOLDER<\/script>
</head>
<body style="background:#0a0a1e">
<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
<defs>
  <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="white"/></marker>
  <marker id="ahb" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#60a5fa"/></marker>
  <!-- Soft neon glow — apply to hero elements: filter="url(#glow)" -->
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="4" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <!-- Stronger glow for focal points: filter="url(#glow-lg)" -->
  <filter id="glow-lg" x="-75%" y="-75%" width="250%" height="250%">
    <feGaussianBlur stdDeviation="9" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <!-- Soft drop shadow for depth: filter="url(#shadow)" -->
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/>
  </filter>
</defs>

<!-- ═══ ALL ELEMENTS FOR ALL 5 SCENES ═══
  Rules:
  - Every element must be wrapped in <g id="unique-id">
  - All groups start with style="opacity:0" unless they are permanent backgrounds
  - Positions in SVG attrs (cx/cy for circles, x/y for rects) = BASE POSITION
  - Scene "move" values are pixel DELTAS from that base: [dx, dy]
  - Elements shared across scenes keep same id, just change position via move
  - Use rich SVG: gradients, multiple shapes per group, descriptive text labels
  - Canvas is 800×450 px
-->

<!-- EXAMPLE ELEMENT GROUPS:
<g id="sun" style="opacity:0">
  <circle cx="120" cy="225" r="52" fill="url(#sunGrad)" filter="url(#glow-lg)"/>
  <text x="120" y="292" text-anchor="middle" fill="#fde68a" font-size="13">Sun</text>
</g>

<g id="molecule-n2" style="opacity:0">
  <circle cx="400" cy="200" r="14" fill="#a78bfa"/>
  <circle cx="424" cy="200" r="14" fill="#818cf8"/>
  <text x="412" y="230" text-anchor="middle" fill="#c4b5fd" font-size="11">N₂</text>
</g>

<g id="ray-blue" style="opacity:0">
  <line x1="160" y1="210" x2="640" y2="210" stroke="#60a5fa" stroke-width="2.5" stroke-dasharray="10 5" marker-end="url(#ahb)"/>
</g>
-->

<!-- PUT ALL YOUR ELEMENTS HERE -->

</svg>
<script>
const SCENES = [
  // ═══ SCENE DATA FORMAT ═══
  // show      : string[] — element ids to fade in (opacity 0→1)
  // hide      : string[] — element ids to fade out (opacity 1→0)
  // move      : { "id": [dx, dy] } — translate element by delta from base SVG position
  //              Keep dx/dy within ±380 to stay on canvas
  //              Use [0,0] to keep element at its base position
  // setup     : () => void — called 350ms after transition. Primitives available:
  //              show(id) / hide(id)         — fade in/out
  //              pop(id)                     — punchy scale-from-zero entrance (use instead of show for emphasis)
  //              draw(id, dur, len)          — draw a path/line on once and keep it (arrows, graphs, outlines)
  //              flow(id, len, dur)          — continuous looping dash flow along a stroke
  //              count(id, to, dur)          — tween a <text> number from 0 → to (great for stats/data)
  //              pulse(id, scale, period)    — looping heartbeat scale
  //              orbit(id, radius, period)   — looping circular motion
  //              recolor(id, color)          — animate fill color (state changes)
  //              stopAnim(id)                — kill an element's looping animation
  //              at(seconds, fn)             — schedule a staggered call within the scene
  //              DO NOT call mv/show/hide inside setup for things already handled above

  {
    show: ["el-a", "el-b"],
    hide: [],
    move: { "el-a": [0, 0] },
    setup: () => {
      pulse("el-a", 1.2, 2);
      at(0.4, () => show("el-c"));
    }
  },
  {
    show: ["el-d"],
    hide: ["el-b"],
    move: { "el-a": [200, -80], "el-d": [0, 0] },
    setup: () => {
      stopAnim("el-a");
      flow("el-ray", 280, 1.8);
    }
  }
  // ... 3 more scenes
];
// Playback is driven by parent via postMessage {type:'goto', index}
<\/script>
</body></html>

══════════════════════════════════
WHAT MAKES THE VIDEO FEEL
══════════════════════════════════
✓ A central "hero element" that drifts across the canvas over 5 scenes (e.g. sun moves top-left→center→small corner)
✓ New elements flying in from off-screen edges (start with base position off canvas, move delta to center)
✓ Color changes via recolor() to show state transitions (e.g. a molecule turns blue when it scatters)
✓ Arrows and diagram lines that draw() themselves on, then persist
✓ Key elements making a punchy pop() entrance rather than a plain fade
✓ Numbers that count() up to reveal a statistic or measurement
✓ Elements shrinking into background (move to corner + scale-like effect using smaller group)
✓ Sequential reveals inside setup() with at() staggering

══════════════════════════════════
VISUAL STANDARDS
══════════════════════════════════
- Background (body style): dark — #0a0a1e, #0d1117, #0a1628, #120420, or topical
- Text: white/near-white, system-ui, 12-24px
- Colors: electric blue #60a5fa, amber #f59e0b, green #4ade80, purple #a78bfa, coral #f87171, gold #ffd700, teal #2dd4bf
- Use <defs> radialGradient/linearGradient for rich element fills
- Apply filter="url(#glow)" or filter="url(#glow-lg)" to luminous/hero elements (suns, particles, energy, focal labels) — this is what makes scenes look premium. Use filter="url(#shadow)" on solid shapes (cards, buildings, boxes) for depth.
- Minimum 10 distinct element groups covering all 5 scenes
- At least 3 elements that appear in 2+ scenes (shared elements that move = video feel)
- Include a scene-title text element that changes content across scenes (typewriter feel via quick show/hide of separate title elements)

Return ONLY valid JSON — no markdown fences:
{"title":"...","narrations":[...],"html":"<!DOCTYPE html>..."}`;

const FINAL_PROMPT = SYSTEM_PROMPT
  .replace('CSS_PLACEHOLDER', CSS)
  .replace('ENGINE_PLACEHOLDER', ENGINE);

export async function generateLesson(query: string): Promise<Lesson> {
  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: FINAL_PROMPT,
    prompt: `Create an animated educational lesson about: "${query}"`,
  });

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in response');

  const lesson = JSON.parse(text.slice(start, end + 1)) as Lesson;
  if (!lesson.html) throw new Error('No HTML in response');
  if (!lesson.narrations?.length) throw new Error('No narrations in response');
  return lesson;
}

const openaiClient = new OpenAI();

export async function generateTTS(narrations: string[]): Promise<string[]> {
  const results = await Promise.all(
    narrations.map(async (text) => {
      const response = await openaiClient.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: text,
        response_format: 'mp3',
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
    })
  );
  return results;
}
