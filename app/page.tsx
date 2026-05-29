"use client"

import { useState, useRef } from 'react';
import { generateLesson, generateTTS, Lesson } from './actions';

type AppState = 'idle' | 'loading' | 'loading-audio' | 'ready' | 'playing' | 'finished';

const EXAMPLES = [
  'Why is the sky blue?',
  'How does the Norwegian parliament work?',
  "What's the difference between a hash map and a B-tree?",
];

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Refs so playScene closure never goes stale
  const audioUrlsRef = useRef<string[]>([]);
  const totalRef = useRef(0);

  function playScene(idx: number) {
    if (idx >= totalRef.current) {
      setState('finished');
      return;
    }
    iframeRef.current?.contentWindow?.postMessage({ type: 'goto', index: idx }, '*');
    setSceneIdx(idx);
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
      setState('loading-audio');
      const urls = await generateTTS(les.narrations);
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

  const reset = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    audioUrlsRef.current = [];
    totalRef.current = 0;
    setState('idle');
    setLesson(null);
    setSceneIdx(0);
  };

  const totalScenes = lesson?.narrations.length ?? 5;
  const narration = lesson?.narrations[sceneIdx] ?? '';
  const progress = state === 'finished' ? 100 : totalScenes > 0 ? (sceneIdx / totalScenes) * 100 : 0;

  /* ── IDLE ── */
  if (state === 'idle') {
    return (
      <main style={{ minHeight: '100vh', background: '#08080f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', color: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: '44px' }}>
          <h1 style={{
            fontSize: '54px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-1.5px',
            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            EduAnimate
          </h1>
          <p style={{ color: '#4b5563', fontSize: '17px' }}>Ask anything. Watch it come alive.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '600px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              type="text"
              name="query"
              placeholder="Why is the sky blue?"
              autoFocus
              style={{
                flex: 1, borderRadius: '14px', padding: '14px 20px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'white', fontSize: '16px', outline: 'none',
              }}
            />
            <button type="submit" style={{ borderRadius: '14px', padding: '14px 24px', background: '#2563eb', color: 'white', fontWeight: 600, fontSize: '16px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Generate →
            </button>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>{error}</p>}

          <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {EXAMPLES.map(q => (
              <button key={q} type="button"
                onClick={() => { if (inputRef.current) inputRef.current.value = q; }}
                style={{ fontSize: '12px', borderRadius: '100px', padding: '6px 14px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }}
              >
                {q}
              </button>
            ))}
          </div>
        </form>
      </main>
    );
  }

  /* ── LOADING ── */
  if (state === 'loading' || state === 'loading-audio') {
    const label = state === 'loading' ? 'Generating your lesson…' : 'Preparing audio…';
    const sublabel = state === 'loading' ? 'Usually takes 15–25 seconds' : 'Synthesising narration with OpenAI TTS';
    return (
      <main style={{ minHeight: '100vh', background: '#08080f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#60a5fa', animation: 'bounce 1s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <p style={{ color: '#9ca3af', fontSize: '16px' }}>{label}</p>
        <p style={{ color: '#374151', fontSize: '13px', marginTop: '6px' }}>{sublabel}</p>
        <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>
      </main>
    );
  }

  if (!lesson) return null;

  /* ── PLAYER (ready / playing / finished) ── */
  return (
    <main style={{ minHeight: '100vh', background: '#08080f', display: 'flex', flexDirection: 'column', color: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson.title}
        </h2>
        <button onClick={reset} style={{ fontSize: '12px', color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← New query
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #818cf8)', transition: 'width 0.9s ease', width: `${progress}%` }} />
      </div>

      {/* Animation */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{
          position: 'relative',
          width: '100%', maxWidth: '900px', aspectRatio: '16/9',
          borderRadius: '16px', overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
          background: '#0a0a1e',
        }}>
          <iframe
            ref={iframeRef}
            srcDoc={lesson.html}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            sandbox="allow-scripts"
            title="Lesson"
          />
          {/* Play overlay — shown only in 'ready' state */}
          {state === 'ready' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)',
            }}>
              <button
                onClick={handlePlay}
                style={{
                  width: '72px', height: '72px', borderRadius: '50%',
                  background: '#2563eb', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '26px', color: 'white',
                  boxShadow: '0 0 0 8px rgba(37,99,235,0.25)',
                  transition: 'transform 0.15s',
                }}
              >
                ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ padding: '12px 24px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{
          textAlign: 'center', fontSize: '14px', lineHeight: '1.65', color: '#94a3b8',
          maxWidth: '620px', margin: '0 auto 12px', minHeight: '46px',
          transition: 'opacity 0.4s ease',
        }}>
          {state !== 'ready' ? narration : ''}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            {Array.from({ length: totalScenes }).map((_, i) => (
              <div key={i} style={{
                height: '5px', borderRadius: '3px', transition: 'all 0.4s ease',
                width: i === sceneIdx ? '18px' : '5px',
                background: i <= sceneIdx && state !== 'ready' ? '#3b82f6' : 'rgba(255,255,255,0.12)',
              }} />
            ))}
          </div>

          {state === 'finished' && (
            <button onClick={reset} style={{ fontSize: '13px', padding: '7px 18px', borderRadius: '10px', background: '#2563eb', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '8px' }}>
              New query
            </button>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#1f2937', marginTop: '8px' }}>
          {state === 'ready' ? 'Ready' : `${sceneIdx + 1} / ${totalScenes}${state === 'finished' ? ' · Complete' : ''}`}
        </p>
      </div>
    </main>
  );
}
