# Improvements

What would need to change for this to be production-ready inside Scrimba.

---

## 1. Fine-tune a model for SVG + animation generation

**Current state:** Claude Sonnet is guided by a long system prompt containing component templates, palette rules, and mandatory quality requirements. Output quality is good but non-deterministic — the model occasionally ignores constraints, draws flat elements, or violates bounding boxes despite multiple safeguards.

**The fix:** Fine-tune a model (Claude or otherwise) on a curated dataset of high-quality `(storyboard → SVG + scene objects)` pairs. A fine-tuned model would:
- Internalize the engine's animation API and never hallucinate primitives
- Consistently produce polished visuals without lengthy prompt scaffolding
- Respect bounding boxes reliably, eliminating the need for server-side `<clipPath>` patching
- Run faster and at lower cost per token since the system prompt shrinks dramatically

Building the training set is the main investment: generate hundreds of lessons, manually curate the best SVG outputs, and use those as ground truth.

---

## 2. Stream scenes progressively — cut time-to-first-frame from ~70s to ~15s

**Current state:** The user waits for all 5 animator calls and all 5 TTS clips to complete before the play button appears. On a slow day this is 70–80 seconds.

**The fix:** As soon as the director returns, fire the 5 animator calls and 5 TTS fetches simultaneously (TTS only needs the narrations, which come from the director). Deliver scene 1 to the browser the moment both its SVG and audio are ready. While the user watches scene 1, scenes 2–5 finish in the background.

This requires a buffering state in the player: if a scene ends and the next one isn't ready yet, show a short spinner and resume automatically when it arrives. The UX complexity is manageable and the time-to-first-frame improvement is significant.

---

## 3. Component-based rendering instead of free-form SVG generation

**Current state:** The model generates raw SVG markup. Despite templates, palette rules, and clip-path enforcement, the output varies. A poorly-drawn scene can look cheap regardless of the animation quality.

**The fix:** Define a library of pre-built, polished SVG/React components (node, card, pill, connector, data bar, timeline step, etc.). The model's output becomes a JSON array of component instances with text, colors, and positions — not raw SVG. The rendering layer turns that JSON into guaranteed-quality visuals.

This is the highest-leverage quality improvement after fine-tuning. Visual consistency becomes a code problem, not a prompt problem.

---

## 4. Prompt caching

**Current state:** Every generation sends the full director and animator system prompts to the API. The animator system prompt alone is ~2 KB, sent 5× per generation.

**The fix:** Use Anthropic's prompt caching (`cache_control: "ephemeral"` on the system prompt). Static prompt sections are cached server-side for 5 minutes. On a warm cache, each animator call skips re-processing ~1500 tokens. At scale this meaningfully reduces both latency and cost.

---

## 5. Generation caching

**Current state:** The same query generates a fresh lesson every time, spending ~70s and several cents of API cost on each.

**The fix:** Cache completed lessons keyed on `(query.toLowerCase().trim(), lang)`. A Redis store or a simple database table would work. The three demo queries in particular could be pre-generated and served instantly. Cache invalidation can be manual or time-based depending on how much variation in output is desirable.

---

## 6. Accessibility — captions and keyboard navigation

**Current state:** Audio narration has no text equivalent visible during playback. The narration line below the video is close, but it shows the full sentence statically rather than tracking the spoken word.

**The fix:**
- Word-level caption sync: ElevenLabs' API returns alignment data (word timestamps) alongside audio. Use these to highlight the current word in a caption track synchronized to `audio.currentTime`.
- Full keyboard navigation: space to pause, arrow keys to seek between chapters, all controls accessible without a mouse.
- ARIA labels on the iframe and transport controls for screen reader compatibility.

---

## 7. Multi-voice and teacher persona support

**Current state:** Hardcoded to a single ElevenLabs voice (Sarah, `EXAVITQu4vr4xnSDxMaL`).

**The fix:** Expose a voice selector or map voices to subject areas (e.g. a warmer voice for humanities, a more precise one for technical topics). ElevenLabs supports voice cloning — Scrimba could use a recognizable teacher voice that users already associate with the platform, creating continuity between AI-generated and human-recorded content.

---

## 8. Scrimba platform integration

**Current state:** A standalone web app with a form input.

**What a Scrimba integration likely needs:**
- A POST `/api/generate` endpoint that accepts `{ query, lang }` and returns a `lesson_id`, so Scrimba's backend can trigger generation programmatically and embed the result in a course page
- A webhook or polling endpoint for generation status, since ~70s is too long for a synchronous HTTP response
- The lesson HTML served from a stable URL (stored in object storage) rather than embedded inline in the API response
- An admin interface to review and approve generated lessons before they go live, since AI output should not be published unreviewed in an educational context

---

## 9. Cost monitoring and budget guardrails

**Current state:** No visibility into per-generation cost. Each lesson uses 6 Claude Sonnet calls and 5 ElevenLabs requests. At current pricing, a single generation costs roughly $0.05–0.15 depending on output length.

**The fix:** Log token counts and API costs per generation. Add a per-user rate limit and a daily spend cap. At Scrimba scale, even a small percentage of abusive or runaway requests could add up quickly.

---

## 10. Evaluation harness

**Current state:** Quality is assessed by eye. There is no automated way to measure whether a generation is good.

**The fix:** Build a lightweight eval pipeline that scores each generation on:
- **Completeness** — did all 5 scenes generate valid SVG and scene objects?
- **Animation richness** — how many animation primitives were used across all scenes?
- **Bounding box compliance** — how many elements required clip-path correction?
- **Subjective quality** — a small set of human-rated reference outputs to compare against using an LLM judge

This data drives prompt iteration and, eventually, fine-tuning dataset curation.
