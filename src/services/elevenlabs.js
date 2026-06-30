import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { config } from '../config.js';

export const elevenlabs = new ElevenLabsClient({ apiKey: config.elevenlabsApiKey });

export async function speak(text) {
  const audio = await elevenlabs.textToSpeech.convert(config.elevenlabsVoiceId, {
    text: text.slice(0, 4500),
    model_id: config.elevenlabsModelId,
    output_format: 'mp3_44100_128',
    voice_settings: {
      stability: 0.55,
      similarity_boost: 0.85,
      style: 0.25,
      use_speaker_boost: true
    }
  });

  const chunks = [];
  for await (const chunk of audio) chunks.push(chunk);

  const buffer = Buffer.concat(chunks);
  const filePath = path.resolve(`reply_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);

  return filePath;
}
