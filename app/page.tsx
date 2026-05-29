"use client"

import { useState, useRef, useCallback, useEffect } from 'react';
import { generateLesson, Lesson } from './actions';

type AppState = 'idle' | 'loading' | 'playing' | 'finished';

const EXAMPLES = [
  'Why is the sky blue?',
  'How does the Norwegian parliament work?',
  "What's the difference between a hash map and a B-tree?",
];

// Pick the best available TTS voice
function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const preferred = ['Google US English', 'Microsoft David', 'Alex', 'Samantha', 'Daniel'];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('en')) ?? voices[0] ?? null;
}

function speak(text: string, onEnd: () => void): SpeechSynthesisUtterance {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.pitch = 1.0;
  u.volume = 1.0;
  const voice = getBestVoice();
  if (voice) u.voice = voice;
  u.onend = onEnd;
  u.onerror = onEnd;
  window.speechSynthesis.speak(u);
  return u;
}

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [currentScene, setCurrentScene] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lessonRef = useRef<Lesson | null>(null);
  const sceneIdxRef = useRef(0);

  // Pre-load TTS voices (Chrome lazy-loads them)
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        window.speechSynthesis.getVoices();
      });
    }
  }, []);

  const playScene = useCallback((les: Lesson, index: number) => {
    if (index >= les.scenes.length) {
      setState('finished');
      return;
    }

    lessonRef.current = les;
    sceneIdxRef.current = index;
    setCurrentScene(index);

    const advance = () => {
      setTimeout(() => {
        const cur = lessonRef.current;
        if (cur) playScene(cur, sceneIdxRef.current + 1);
      }, 700);
    };

    if (!('speechSynthesis' in window)) {
      const words = les.scenes[index].narration.split(' ').length;
      setTimeout(advance, (words / 2.5) * 1000);
      return;
    }

    speak(les.scenes[index].narration, advance);
  }, []);

  const handleSubmit = async (e: { preventDefault(): void; currentTarget: HTMLFormElement }) => {
    e.preventDefault();
    const query = (new FormData(e.currentTarget).get('query') as string).trim();
    if (!query) return;

    setError(null);
    setState('loading');
    try {
      const les = await generateLesson(query);
      setLesson(les);
      setCurrentScene(0);
      setState('playing');
      playScene(les, 0);
    } catch {
      setError('Generation failed — please try again.');
      setState('idle');
    }
  };

  const skip = () => {
    window.speechSynthesis?.cancel();
    const les = lessonRef.current;
    if (les) playScene(les, sceneIdxRef.current + 1);
  };

  const restart = () => {
    const les = lessonRef.current;
    if (!les) return;
    setState('playing');
    setCurrentScene(0);
    playScene(les, 0);
  };

  const reset = () => {
    window.speechSynthesis?.cancel();
    setState('idle');
    setLesson(null);
    lessonRef.current = null;
  };

  /* ── IDLE ── */
  if (state === 'idle') {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', color: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{
            fontSize: '52px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-1px',
            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            EduAnimate
          </h1>
          <p style={{ color: '#6b7280', fontSize: '18px' }}>Ask anything. Watch it come alive.</p>
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
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'white', fontSize: '16px', outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                borderRadius: '14px', padding: '14px 24px', background: '#2563eb',
                color: 'white', fontWeight: 600, fontSize: '16px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Generate →
            </button>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>{error}</p>}

          <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {EXAMPLES.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => { if (inputRef.current) inputRef.current.value = q; }}
                style={{
                  fontSize: '12px', borderRadius: '100px', padding: '6px 14px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af',
                }}
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
  if (state === 'loading') {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: '12px', height: '12px', borderRadius: '50%', background: '#60a5fa',
                animation: 'bounce 1s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <p style={{ color: '#d1d5db', fontSize: '16px' }}>Generating your lesson…</p>
        <p style={{ color: '#4b5563', fontSize: '13px', marginTop: '6px' }}>Usually takes 15–25 seconds</p>
        <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}`}</style>
      </main>
    );
  }

  if (!lesson) return null;

  const scene = lesson.scenes[currentScene];
  const progress = (currentScene / lesson.scenes.length) * 100;

  /* ── PLAYER ── */
  return (
    <main style={{ minHeight: '100vh', background: '#080818', display: 'flex', flexDirection: 'column', color: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', maxWidth: '600px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson.title}
        </h2>
        <button onClick={reset} style={{ fontSize: '13px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← New query
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: '2px', background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,#3b82f6,#818cf8)', transition: 'width 0.7s ease', width: `${progress}%` }} />
      </div>

      {/* Scene animation */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{
          width: '100%', maxWidth: '900px', aspectRatio: '16/9',
          borderRadius: '16px', overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          background: '#0d0d1a',
        }}>
          <iframe
            key={currentScene}
            srcDoc={scene.html}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            sandbox="allow-scripts"
            title={`Scene ${currentScene + 1}`}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ padding: '16px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Narration */}
        <p style={{
          textAlign: 'center', fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1',
          maxWidth: '640px', margin: '0 auto 16px', minHeight: '44px',
        }}>
          {scene.narration}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          {/* Scene dots */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {lesson.scenes.map((_, i) => (
              <div
                key={i}
                style={{
                  height: '6px', borderRadius: '3px', transition: 'all 0.3s ease',
                  width: i === currentScene ? '20px' : '6px',
                  background: i <= currentScene ? '#3b82f6' : 'rgba(255,255,255,0.15)',
                }}
              />
            ))}
          </div>

          {state === 'playing' && (
            <button onClick={skip} style={{ fontSize: '13px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>
              Skip →
            </button>
          )}

          {state === 'finished' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={restart} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer' }}>
                ↺ Replay
              </button>
              <button onClick={reset} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '10px', background: '#2563eb', border: 'none', color: 'white', cursor: 'pointer' }}>
                New query
              </button>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#374151', marginTop: '10px' }}>
          {currentScene + 1} / {lesson.scenes.length}{state === 'finished' ? ' · Complete' : ''}
        </p>
      </div>
    </main>
  );
}
