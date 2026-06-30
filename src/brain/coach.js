import { chat } from '../services/openai.js';
import { getMemory, getSetting, saveImportantMemory, saveJournal, saveTasks } from './memory.js';
import { systemPrompt } from './prompt.js';
import { config } from '../config.js';

export function extractTasks(aiReply) {
  const lines = aiReply.split('\n');

  return lines
    .filter(line => line.includes('-') || /^\d+[.)]/.test(line.trim()))
    .map(line => line.replace(/^[-\d.)\s]+/, '').trim())
    .filter(line => line.length > 10 && line.length < 180)
    .slice(0, 5);
}

export async function coachReply(telegramId, userText, forcedMode = null) {
  const mode = forcedMode || getSetting(telegramId, 'mode', 'coach');
  const memory = getMemory(telegramId);

  const reply = await chat([
    { role: 'system', content: systemPrompt(mode) },
    {
      role: 'user',
      content: `
Güçlü hafıza:
${memory.memories || 'Henüz güçlü hafıza yok.'}

Son konuşmalar:
${memory.history || 'Henüz konuşma yok.'}

Açık görevler:
${memory.tasks || 'Açık görev yok.'}

Yeni mesaj:
${userText}
`
    }
  ]);

  return reply || `Cevap üretilemedi ${config.userTitle}.`;
}

export async function processUserMessage(telegramId, userText) {
  const mode = getSetting(telegramId, 'mode', 'coach');
  const reply = await coachReply(telegramId, userText, mode);
  const tasks = extractTasks(reply);

  saveJournal(telegramId, userText, reply, mode);
  saveTasks(telegramId, tasks);

  try {
    await saveImportantMemory(telegramId, userText, reply);
  } catch (err) {
    console.error('Hafıza çıkarımı hatası:', err.message);
  }

  return reply;
}
