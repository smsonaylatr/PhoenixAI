import fs from 'fs';
import OpenAI from 'openai';
import { config } from '../config.js';

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

export async function transcribeAudio(filePath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: config.openaiTranscribeModel,
    language: 'tr'
  });

  return transcription.text || '';
}

export async function chat(messages) {
  const response = await openai.chat.completions.create({
    model: config.openaiChatModel,
    messages
  });

  return response.choices?.[0]?.message?.content || '';
}
