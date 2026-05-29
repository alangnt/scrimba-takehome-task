"use client"

import { useState, useRef, useEffect } from 'react';
import { generateLesson, Lesson } from './actions';

type AppState = 'idle' | 'loading' | 'loading-audio' | 'ready' | 'playing' | 'finished';

const LOADING_QUIPS = [
  'Convincing Claude it\'s a motion designer…',
  'Arguing with the laws of physics…',
  'Generating 47 drafts, keeping the best one…',
  'Bribing the SVG renderer with compliments…',
  'Teaching the AI what colours are…',
  'Having an existential crisis about bounding boxes…',
  'Asking an AI to explain things to another AI…',
  'Making electrons do ballet…',
  'Calculating the exact shade of "pretty"…',
  'Debugging the vibes…',
  'Consulting the algorithm gods…',
  'Whispering sweet nothings to the neural network…',
];

const EXAMPLES = [
  'Why is the sky blue?',
  'How does the Norwegian parliament work?',
  "Hash map vs. B-tree",
];

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quipIdx, setQuipIdx] = useState(0);

  useEffect(() => {
    if (state !== 'loading' && state !== 'loading-audio') return;
    const id = setInterval(() => setQuipIdx(i => (i + 1) % LOADING_QUIPS.length), 3000);
    return () => clearInterval(id);
  }, [state]);
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Refs so playScene closure never goes stale
  const audioUrlsRef = useRef<string[]>([]);
  const framesRef = useRef<number[][]>([]);
  const totalRef = useRef(0);

  const post = (msg: object) => iframeRef.current?.contentWindow?.postMessage(msg, '*');

  function playScene(idx: number) {
    if (idx >= totalRef.current) {
      setState('finished');
      return;
    }
    post({ type: 'goto', index: idx, cam: framesRef.current[idx] });
    setSceneIdx(idx);
    setPaused(false);
    const audio = new Audio(audioUrlsRef.current[idx]);
    audioRef.current = audio;
    audio.onended = () => playScene(idx + 1);
    audio.onerror = () => playScene(idx + 1);
    audio.play();
  }

  const handleSubmit = async (e: { preventDefault(): void; currentTarget: HTMLFormElement }) => {
    e.preventDefault();
    const query = (new FormData(e.currentTarget).get('query') as string).trim();
    if (!query) return;
    setError(null);
    setState('loading');
    try {
      const les = await generateLesson(query);
      setLesson(les);
      framesRef.current = les.frames;
      setState('loading-audio');
      const urls = await Promise.all(
        les.narrations.map(async (text) => {
          const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        })
      );
      audioUrlsRef.current = urls;
      totalRef.current = les.narrations.length;
      setSceneIdx(0);
      setState('ready');
    } catch {
      setError('Generation failed — please try again.');
      setState('idle');
    }
  };

  const handlePlay = () => {
    setState('playing');
    playScene(0);
  };

  // Jump to any scene: rebuild the animation state, then play that scene's audio
  function jumpTo(idx: number) {
    const target = Math.max(0, idx);
    audioRef.current?.pause();
    if (target >= totalRef.current) {
      setState('finished');
      return;
    }
    post({ type: 'seek', index: target, cam: framesRef.current[target] });
    setSceneIdx(target);
    setState('playing');
    setPaused(false);
    const audio = new Audio(audioUrlsRef.current[target]);
    audioRef.current = audio;
    audio.onended = () => playScene(target + 1);
    audio.onerror = () => playScene(target + 1);
    audio.play();
  }

  // Pause/resume audio and the animation timeline together
  const togglePause = () => {
    if (paused) {
      audioRef.current?.play();
      post({ type: 'resume' });
      setPaused(false);
    } else {
      audioRef.current?.pause();
      post({ type: 'pause' });
      setPaused(true);
    }
  };

  const reset = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    audioUrlsRef.current = [];
    framesRef.current = [];
    totalRef.current = 0;
    setState('idle');
    setLesson(null);
    setSceneIdx(0);
    setPaused(false);
  };

  const totalScenes = lesson?.narrations.length ?? 5;
  const narration = lesson?.narrations[sceneIdx] ?? '';
  const progress = state === 'finished' ? 100 : totalScenes > 0 ? (sceneIdx / totalScenes) * 100 : 0;

  /* ── IDLE ── */
  if (state === 'idle') {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-44 left-1/2 h-[460px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.22),transparent_70%)] blur-3xl"
          style={{ animation: 'glow-pulse 7s ease-in-out infinite' }}
        />

        <div className="relative w-full max-w-xl" style={{ animation: 'fade-up 0.6s ease both' }}>
          <div className="mb-11 text-center">
            <h1 className="mb-3 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-[56px] font-bold leading-none tracking-tight text-transparent">
              EduAnimate
            </h1>
            <p className="text-[17px] text-zinc-500">Ask anything. Watch it come alive.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                name="query"
                placeholder="Why is the sky blue?"
                autoFocus
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-white/25 focus:bg-white/[0.05] focus:ring-4 focus:ring-white/5"
              />
              <button
                type="submit"
                className="rounded-xl bg-white px-6 py-3.5 text-[15px] font-medium text-black transition hover:bg-zinc-200 active:scale-[0.98]"
              >
                Generate →
              </button>
            </div>

            {error && <p className="mt-2.5 text-center text-sm text-red-400">{error}</p>}

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { if (inputRef.current) inputRef.current.value = q; }}
                  className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-zinc-500 transition hover:border-white/25 hover:text-zinc-300"
                >
                  {q}
                </button>
              ))}
            </div>
          </form>
        </div>
      </main>
    );
  }

  /* ── LOADING ── */
  if (state === 'loading' || state === 'loading-audio') {
    const label = state === 'loading' ? 'Generating your lesson…' : 'Preparing audio…';
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-0">
        <div className="mb-5 flex gap-2.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-zinc-400"
              style={{ animation: 'bounce-dot 1s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <p className="text-base text-zinc-400">{label}</p>
        <p className="mt-1 text-[13px] text-zinc-600">This can take about a minute — good things take time.</p>
        <p className="mt-5 text-[13px] text-zinc-500 transition-opacity duration-500">{LOADING_QUIPS[quipIdx]}</p>
      </main>
    );
  }

  if (!lesson) return null;

  /* ── PLAYER (ready / playing / finished) ── */
  return (
    <main className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <h2 className="max-w-md truncate text-[13px] font-medium text-zinc-400">{lesson.title}</h2>
        <button onClick={reset} className="text-xs text-zinc-600 transition hover:text-zinc-300">
          ← New query
        </button>
      </header>

      {/* Progress bar */}
      <div className="h-px bg-white/[0.06]">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Animation */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="relative aspect-video w-full max-w-[900px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a1e] shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
          <iframe
            ref={iframeRef}
            srcDoc={lesson.html}
            className="block h-full w-full border-none"
            sandbox="allow-scripts"
            title="Lesson"
          />
          {/* Play overlay — shown only in 'ready' state */}
          {state === 'ready' && (
            <div className="absolute inset-0 grid place-items-center bg-black/50 backdrop-blur-sm">
              <button
                onClick={handlePlay}
                className="grid h-16 w-16 place-items-center rounded-full bg-white text-black shadow-[0_0_0_8px_rgba(255,255,255,0.12)] transition hover:scale-105 active:scale-95"
                aria-label="Play lesson"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06] px-6 pb-5 pt-3">
        <p className="mx-auto mb-3 min-h-[44px] max-w-2xl text-center text-sm leading-relaxed text-zinc-400 transition-opacity duration-300">
          {state !== 'ready' ? narration : ''}
        </p>

        {/* Chapter summary — click any chapter to jump straight to it */}
        <div className="mx-auto flex flex-col md:flex-row max-w-3xl items-stretch gap-2">
          {lesson.chapters.map((c, i) => {
            const active = i === sceneIdx && state !== 'ready';
            const visited = i < sceneIdx && state !== 'ready';
            return (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                aria-label={`Chapter ${i + 1}: ${c}`}
                className={`group relative flex-1 rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? 'border-indigo-500/60 bg-indigo-500/10'
                    : 'border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                <div
                  className={`text-[10px] font-semibold tabular-nums tracking-wider transition-colors ${
                    active ? 'text-indigo-300' : visited ? 'text-zinc-500' : 'text-zinc-600'
                  }`}
                >
                  Chapter {String(i + 1).padStart(2, '0')}
                </div>
                <div
                  className={`mt-0.5 text-[12.5px] font-medium leading-tight transition-colors ${
                    active ? 'text-white' : visited ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                >
                  {c}
                </div>
              </button>
            );
          })}
        </div>

        {/* Transport */}
        <div className="mt-4 flex items-center justify-center gap-3">
          {state !== 'ready' && (
            <button
              onClick={() => jumpTo(0)}
              aria-label="Replay from start"
              className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          )}

          {state === 'playing' && (
            <button
              onClick={togglePause}
              aria-label={paused ? 'Resume' : 'Pause'}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition hover:scale-105 active:scale-95"
            >
              {paused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              )}
            </button>
          )}

          {state === 'finished' && (
            <button
              onClick={reset}
              className="rounded-lg bg-white px-4 py-1.5 text-[13px] font-medium text-black transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              New query
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
