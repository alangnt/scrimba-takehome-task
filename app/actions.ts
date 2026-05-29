"use server"

import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export interface Scene {
  narration: string;
  html: string;
}

export interface Lesson {
  title: string;
  scenes: Scene[];
}

// Pre-built animation helper injected into every scene.
// The LLM only needs to: place SVG elements, then call these helpers in at(t, fn) blocks.
const HELPER = `<script>
const $=id=>document.getElementById(id);
const show=(id,d=.5)=>{const e=$(id);if(e){e.style.transition=\`opacity \${d}s ease\`;e.style.opacity=1}};
const hide=(id,d=.3)=>{const e=$(id);if(e){e.style.transition=\`opacity \${d}s ease\`;e.style.opacity=0}};
const move=(id,x,y,d=.6)=>{const e=$(id);if(e){e.style.transition=\`transform \${d}s cubic-bezier(.34,1.56,.64,1)\`;e.style.transform=\`translate(\${x}px,\${y}px)\`}};
const at=(t,fn)=>setTimeout(fn,t*1e3);
const pulse=(id,s=1.18,p=1.6)=>{const e=$(id);if(e){e.style.setProperty('--ps',s);e.style.animation=\`pulse \${p}s ease-in-out infinite\`}};
const orbit=(id,r=70,p=3)=>{const e=$(id);if(e){e.style.setProperty('--or',r+'px');e.style.animation=\`orbit \${p}s linear infinite\`}};
const flow=(id,len=300,p=2)=>{const e=$(id);if(e){e.style.strokeDasharray=len;e.style.strokeDashoffset=len;e.style.animation=\`flow \${p}s linear infinite\`}};
const recolor=(id,c,d=.5)=>{const e=$(id);if(e){e.style.transition=\`fill \${d}s\`;e.setAttribute('fill',c)}};
const grow=(id,d=.7)=>{const e=$(id);if(e){e.style.transition=\`transform \${d}s cubic-bezier(.34,1.56,.64,1)\`;e.style.transformOrigin='center bottom';e.style.transform='scaleY(1)'}};
const typewrite=(id,txt,speed=50)=>{const e=$(id);if(!e)return;e.textContent='';[...txt].forEach((c,i)=>at(i*speed/1e3,()=>e.textContent+=c))};
<\/script>`;

const KEYFRAMES = `@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(var(--ps,1.18))}}
@keyframes orbit{from{transform:rotate(0deg) translateX(var(--or,70px)) rotate(0deg)}to{transform:rotate(360deg) translateX(var(--or,70px)) rotate(-360deg)}}
@keyframes flow{from{stroke-dashoffset:var(--len,300)}to{stroke-dashoffset:0}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes dash{to{stroke-dashoffset:0}}
@keyframes shimmer{0%,100%{opacity:.7}50%{opacity:1}}`;

const SYSTEM_PROMPT = `You are a world-class educational animator. You create animated visual lessons that play in a web browser.

For each educational query, produce exactly 5 scenes as JSON. Each scene has:
  narration: 2-3 sentences a teacher speaks (clear, engaging)
  html: A complete self-contained HTML document using the template and helpers below

══════════════════════════════════════════
SCENE TEMPLATE — copy this exact structure
══════════════════════════════════════════

<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:800px;height:450px;overflow:hidden;background:BG_COLOR;font-family:'Segoe UI',system-ui,sans-serif}
${KEYFRAMES}
text{font-family:'Segoe UI',system-ui,sans-serif}
</style>
HELPER_SCRIPT
</head>
<body>
<svg viewBox="0 0 800 450" width="800" height="450" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="ARROW_COLOR"/>
    </marker>
    <marker id="ah2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="#60a5fa"/>
    </marker>
    <!-- Add radialGradient / linearGradient here if needed -->
  </defs>
  <!-- SVG ELEMENTS (all start with style="opacity:0" unless immediately visible) -->
</svg>
<script>
// Timeline using at(seconds, () => { ... })
// show(id) — fade in | hide(id) — fade out | move(id, dx, dy) — translate
// pulse(id, scale, period) — looping scale pulse | orbit(id, radius, period) — orbit parent center
// flow(id, dashlen, period) — animate stroke-dashoffset | grow(id) — scaleY from 0 to 1
// recolor(id, '#hex') — animate fill | typewrite(id, 'text') — typewriter effect

// TIMING GUIDE:
// at(0, ...)     → immediate elements (background rect, title)
// at(0.3–1, ...) → reveal key shapes one by one
// at(1–2, ...)   → start looping animations (pulse, orbit, flow)
// at(2+, ...)    → secondary labels, details, comparisons

// ANIMATION CODE HERE
</script>
</body></html>

══════════════════════════════════════════
VISUAL GUIDELINES
══════════════════════════════════════════
Background: deep dark — #0d0d1a, #0a1628, #0d1117, #0d0d0d, #12001a, or topic-appropriate
Text: white/near-white — #f1f5f9, #e2e8f0, #ffffff
Accent palette: electric blue #60a5fa, amber #f59e0b, green #4ade80, purple #a78bfa, coral #f87171, gold #ffd700

Required per scene:
• A large title <text> that appears first (font-size 26-32, bold, bright)
• At least 4 distinct visual elements (circles, rects, lines, arrows, text labels)
• At least 3 animated steps: sequential reveals + at least one looping animation
• Direct visual metaphor for what is being narrated

Strong patterns:
• Particles: <circle r="4" fill="COLOR"> + move(id, dx, dy) in a loop offset by at()
• Flowing data: <line stroke-dasharray="10 6"> + flow(id, 300, 2)
• Solar/atomic models: circle children with orbit()
• Sequential reveals: shapes appearing one by one with show() timed 0.3s apart
• Comparison: two labeled columns, bars that grow()
• Network: circles connected by lines/arrows, pulse() on nodes

Avoid: invisible animations, elements never shown, missing labels, all elements appearing at once

══════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════
Return ONLY valid JSON — no markdown, no code fences, no extra text:
{"title":"...","scenes":[{"narration":"...","html":"<!DOCTYPE html>..."},{"narration":"...","html":"<!DOCTYPE html>..."},{"narration":"...","html":"<!DOCTYPE html>..."},{"narration":"...","html":"<!DOCTYPE html>..."},{"narration":"...","html":"<!DOCTYPE html>..."}]}`;

// Replace placeholder tokens in the template (so the LLM sees the actual helper code)
const PROMPT_WITH_HELPER = SYSTEM_PROMPT
  .replace('HELPER_SCRIPT', HELPER)
  .replace('${KEYFRAMES}', KEYFRAMES);

export async function generateLesson(query: string): Promise<Lesson> {
  const { text } = await generateText({
    model: groq('llama-3.3-70b-versatile'),
    system: PROMPT_WITH_HELPER,
    prompt: `Create an animated educational lesson answering: "${query}"`,
  });

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON found in response');
  }

  const lesson = JSON.parse(text.slice(start, end + 1)) as Lesson;
  if (!lesson.scenes?.length) {
    throw new Error('No scenes generated');
  }
  return lesson;
}
