import { db } from '../database.js';
import { chat } from '../services/openai.js';
import { config } from '../config.js';

export function getSetting(telegramId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE telegram_id = ? AND key = ?').get(telegramId, key);
  return row?.value ?? fallback;
}

export function setSetting(telegramId, key, value) {
  db.prepare(`
    INSERT INTO settings (telegram_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id, key) DO UPDATE SET value = excluded.value
  `).run(telegramId, key, value);
}

export function getMemory(telegramId) {
  const memories = db.prepare(`
    SELECT memory, importance, category FROM memories
    WHERE telegram_id = ?
    ORDER BY importance DESC, id DESC
    LIMIT 30
  `).all(telegramId);

  const journals = db.prepare(`
    SELECT user_text, ai_reply, mode FROM journal
    WHERE telegram_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).all(telegramId).reverse();

  const tasks = db.prepare(`
    SELECT id, task FROM tasks
    WHERE telegram_id = ? AND status = 'pending'
    ORDER BY id DESC
    LIMIT 15
  `).all(telegramId);

  return {
    memories: memories.map(m => `[${m.category} / ${m.importance}] ${m.memory}`).join('\n'),
    history: journals.map(h => `Kullanıcı: ${h.user_text}\n${config.botName} (${h.mode}): ${h.ai_reply}`).join('\n\n'),
    tasks: tasks.map(t => `${t.id}) ${t.task}`).join('\n')
  };
}

export function addMemory(telegramId, memory, category = 'general', importance = 70) {
  db.prepare(`
    INSERT INTO memories (telegram_id, memory, importance, category)
    VALUES (?, ?, ?, ?)
  `).run(telegramId, memory, importance, category);
}

export async function saveImportantMemory(telegramId, userText, aiReply) {
  const prompt = `
Aşağıdaki konuşmadan kalıcı hafızaya yazmaya değer bilgi var mı?
Sadece uzun süre işe yarayacak hedef, tercih, proje, alışkanlık, hitap, önemli karar varsa çıkar.
Yoksa sadece "YOK" yaz.
Varsa şu formatta en fazla 3 satır yaz:
category | importance(1-100) | memory

Kullanıcı: ${userText}
Cevap: ${aiReply}
`;

  const text = (await chat([{ role: 'user', content: prompt }])).trim() || 'YOK';
  if (text === 'YOK') return;

  for (const line of text.split('\n').slice(0, 3)) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) continue;

    const [category, importanceRaw, memory] = parts;
    const importance = Math.max(1, Math.min(100, Number.parseInt(importanceRaw, 10) || 50));
    if (memory.length < 8) continue;

    addMemory(telegramId, memory, category || 'general', importance);
  }
}

export function saveJournal(telegramId, userText, aiReply, mode = 'coach') {
  db.prepare(`
    INSERT INTO journal (telegram_id, user_text, ai_reply, mode)
    VALUES (?, ?, ?, ?)
  `).run(telegramId, userText, aiReply, mode);
}

export function saveTasks(telegramId, tasks) {
  for (const task of tasks) {
    db.prepare('INSERT INTO tasks (telegram_id, task) VALUES (?, ?)').run(telegramId, task);
  }
}
