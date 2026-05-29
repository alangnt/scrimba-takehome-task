import { ElevenLabsClient } from 'elevenlabs';
import { NextRequest } from 'next/server';

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text');
  if (!text) return new Response('Missing text', { status: 400 });

  const stream = await elevenlabs.textToSpeech.convert(VOICE_ID, {
    text,
    model_id: 'eleven_turbo_v2_5',
    output_format: 'mp3_44100_128',
    voice_settings: { stability: 0.45, similarity_boost: 0.75 },
  });

  return new Response(stream as unknown as ReadableStream, {
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}
