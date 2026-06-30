import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import cron from 'node-cron';
import Database from 'better-sqlite3';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const REQUIRED_ENV = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.warn(`UYARI: .env içinde ${key} eksik.`);
  }
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

const OWNER_ID = String(process.env.OWNER_TELEGRAM_ID || '');
const USER_TITLE = process.env.USER_TITLE || 'Aslan Bey';
const BOT_NAME = process.env.BOT_NAME || 'Phoenix AI';
const TZ = process.env.TZ || 'Europe/Istanbul';

const db = new Database('phoenix-ai.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  user_text TEXT,
  ai_reply TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  task TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  memory TEXT,
  importance INTEGER DEFAULT 50,
  category TEXT DEFAULT 'general',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function onlyOwner(ctx) {
  if (!OWNER_ID) return true;
  return String(ctx.from?.id) === OWNER_ID;
}

function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

async function downloadTelegramFile(fileId) {
  const fileLink = await bot.telegram.getFileLink(fileId);
  const filePath = path.resolve(`voice_${Date.now()}.ogg`);
  const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, response.data);
  return filePath;
}

async function transcribeAudio(filePath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
    language: 'tr'
  });

  return transcription.text || '';
}

async function speak(text) {
  const audio = await elevenlabs.textToSpeech.convert(process.env.ELEVENLABS_VOICE_ID, {
    text: text.slice(0, 4500),
    model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
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

async function sendVoiceTextButtons(target, text, buttons = []) {
  let voicePath;

  try {
    voicePath = await speak(text);

    if (target.replyWithVoice) {
      await target.replyWithVoice({ source: voicePath });
    } else {
      await bot.telegram.sendVoice(OWNER_ID, { source: voicePath });
    }
  } catch (err) {
    console.error('Ses üretim/gönderim hatası:', err.message);
  } finally {
    safeUnlink(voicePath);
  }

  const payload = buttons.length
    ? {
        reply_markup: {
          inline_keyboard: buttons.map(row =>
            row.map(btn => ({
              text: btn.text,
              callback_data: btn.data
            }))
          )
        }
      }
    : undefined;

  if (target.reply) return target.reply(text, payload);

  return bot.telegram.sendMessage(OWNER_ID, text, payload);
}

const mainMenuButtons = [
  [
    { text: '🟢 Hazırım', data: 'mood_ready' },
    { text: '🟡 10 dk ver', data: 'mood_10min' }
  ],
  [
    { text: '🔴 Moral düşük', data: 'mood_low' },
    { text: '🧠 Bana görev seç', data: 'task_ai_suggest' }
  ]
];

const businessButtons = [
  [{ text: '📢 Reklam metni', data: 'task_ad_copy' }],
  [{ text: '🛒 Ürün sayfası', data: 'task_product_page' }],
  [{ text: '📱 Sosyal medya fikri', data: 'task_social_idea' }],
  [{ text: '🧠 Bana sen öner', data: 'task_ai_suggest' }]
];

function getMemory(telegramId) {
  const memories = db.prepare(`
    SELECT memory, importance, category FROM memories
    WHERE telegram_id = ?
    ORDER BY importance DESC, id DESC
    LIMIT 20
  `).all(telegramId);

  const journals = db.prepare(`
    SELECT user_text, ai_reply FROM journal
    WHERE telegram_id = ?
    ORDER BY id DESC
    LIMIT 8
  `).all(telegramId).reverse();

  const tasks = db.prepare(`
    SELECT id, task FROM tasks
    WHERE telegram_id = ? AND status = 'pending'
    ORDER BY id DESC
    LIMIT 10
  `).all(telegramId);

  return {
    memories: memories.map(m => `[${m.category} / ${m.importance}] ${m.memory}`).join('\n'),
    history: journals.map(h => `Kullanıcı: ${h.user_text}\n${BOT_NAME}: ${h.ai_reply}`).join('\n\n'),
    tasks: tasks.map(t => `${t.id}) ${t.task}`).join('\n')
  };
}

async function coachReply(telegramId, userText) {
  const memory = getMemory(telegramId);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `
Sen ${BOT_NAME}'sın.
${USER_TITLE}'in kişisel gelişim, iş ve disiplin koçusun.
Amacın sadece cevap vermek değil; hedef takip etmek, soru sormak, görev vermek, ertelemeyi azaltmak ve ilerlemeyi ölçmek.

Tarz:
- Türkçe konuş.
- Hitap her zaman: ${USER_TITLE}.
- Kısa, net, motive edici ol.
- Gerektiğinde sert ama saygılı ol.
- Uzun nutuk atma.
- Her yanıtta uygulanabilir 1-3 net aksiyon üret.
- Sağlık, hukuk, finans gibi yüksek riskli konularda uzman desteği gerektiğini belirt.

Hafıza kuralları:
- Kalıcı tercihleri ve hedefleri önemse.
- Eski konuşmalardan bağlantı kur.
- Kullanıcının projelerini hatırla.
- Kesin olmayan duygu çıkarımlarını kesin teşhis gibi söyleme.

Cevabın sonunda mümkünse şu başlığı ekle:
Bugünkü net görevlerin:
`
      },
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
    ]
  });

  return response.choices?.[0]?.message?.content || `Cevap üretilemedi ${USER_TITLE}.`;
}

function extractTasks(aiReply) {
  const lines = aiReply.split('\n');

  return lines
    .filter(line => line.includes('-') || /^\d+[.)]/.test(line.trim()))
    .map(line => line.replace(/^[-\d.)\s]+/, '').trim())
    .filter(line => line.length > 10 && line.length < 180)
    .slice(0, 5);
}

async function saveImportantMemory(telegramId, userText, aiReply) {
  const prompt = `
Aşağıdaki konuşmadan kalıcı hafızaya yazmaya değer bilgi var mı?
Sadece uzun süre işe yarayacak hedef, tercih, proje, alışkanlık, hitap, önemli karar varsa çıkar.
Yoksa sadece "YOK" yaz.
Varsa şu formatta en fazla 3 satır yaz:
category | importance(1-100) | memory

Kullanıcı: ${userText}
Cevap: ${aiReply}
`;

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  const text = res.choices?.[0]?.message?.content?.trim() || 'YOK';
  if (text === 'YOK') return;

  for (const line of text.split('\n').slice(0, 3)) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) continue;

    const [category, importanceRaw, memory] = parts;
    const importance = Math.max(1, Math.min(100, Number.parseInt(importanceRaw, 10) || 50));

    if (memory.length < 8) continue;

    db.prepare(`
      INSERT INTO memories (telegram_id, memory, importance, category)
      VALUES (?, ?, ?, ?)
    `).run(telegramId, memory, importance, category || 'general');
  }
}

async function handleUserText(ctx, text) {
  const telegramId = String(ctx.from.id);
  const reply = await coachReply(telegramId, text);

  db.prepare(`
    INSERT INTO journal (telegram_id, user_text, ai_reply)
    VALUES (?, ?, ?)
  `).run(telegramId, text, reply);

  const tasks = extractTasks(reply);

  for (const task of tasks) {
    db.prepare(`
      INSERT INTO tasks (telegram_id, task)
      VALUES (?, ?)
    `).run(telegramId, task);
  }

  try {
    await saveImportantMemory(telegramId, text, reply);
  } catch (err) {
    console.error('Hafıza çıkarımı hatası:', err.message);
  }

  // Sadece final cevap: ses + metin + buton
  await sendVoiceTextButtons(ctx, reply, mainMenuButtons);
}

bot.start(async (ctx) => {
  if (!onlyOwner(ctx)) return ctx.reply('Bu bot özel kullanım içindir.');

  db.prepare(`
    INSERT OR IGNORE INTO users (telegram_id, name)
    VALUES (?, ?)
  `).run(String(ctx.from.id), ctx.from.first_name || USER_TITLE);

  db.prepare(`
    INSERT INTO memories (telegram_id, memory, importance, category)
    VALUES (?, ?, ?, ?)
  `).run(String(ctx.from.id), `Kullanıcıya ${USER_TITLE} diye hitap edilecek.`, 100, 'identity');

  await sendVoiceTextButtons(ctx, `
${BOT_NAME} aktif ${USER_TITLE}.

Komutlar:
/gunluk - Günlük 4 soru
/gorevler - Açık görevler
/tamam ID - Görevi tamamla
/rapor - Gün özeti
/hafiza - Güçlü hafızalar
/id - Telegram ID göster

Başlayalım mı?
`, mainMenuButtons);
});

bot.command('id', async (ctx) => {
  await ctx.reply(`Telegram ID: ${ctx.from.id}`);
});

bot.command('gunluk', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await sendVoiceTextButtons(ctx, `
${USER_TITLE}, bugünkü 4 soruyu sesli cevaplayın:

1. Bugün beni hedefime yaklaştıracak en önemli iş ne?
2. Şu an en çok neyi erteliyorum?
3. Bugün para kazandıracak net aksiyonum ne?
4. Akşam "başardım" demem için ne tamamlanmalı?
`, mainMenuButtons);
});

bot.command('gorevler', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  const tasks = db.prepare(`
    SELECT id, task FROM tasks
    WHERE telegram_id = ? AND status = 'pending'
    ORDER BY id DESC
    LIMIT 20
  `).all(String(ctx.from.id));

  if (!tasks.length) {
    return sendVoiceTextButtons(ctx, `Açık görevin yok ${USER_TITLE}. Yeni hedef belirleyelim.`, businessButtons);
  }

  await ctx.reply(tasks.map(t => `${t.id}) ${t.task}`).join('\n'));
});

bot.command('tamam', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  const id = ctx.message.text.split(' ')[1];

  if (!id) {
    return ctx.reply('Kullanım: /tamam 12');
  }

  db.prepare(`
    UPDATE tasks
    SET status = 'done', done_at = CURRENT_TIMESTAMP
    WHERE id = ? AND telegram_id = ?
  `).run(id, String(ctx.from.id));

  await sendVoiceTextButtons(ctx, `Güzel iş ${USER_TITLE}. Görev tamamlandı. ID: ${id}`, mainMenuButtons);
});

bot.command('rapor', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  const telegramId = String(ctx.from.id);

  const done = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE telegram_id = ? AND status = 'done'
    AND date(done_at) = date('now')
  `).get(telegramId).count;

  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE telegram_id = ? AND status = 'pending'
  `).get(telegramId).count;

  await sendVoiceTextButtons(ctx, `
Günlük rapor ${USER_TITLE}.

Tamamlanan görev: ${done}
Açık görev: ${pending}

Yorum: Açık görevleri küçültüp hemen bir tanesini bitirelim.
`, businessButtons);
});

bot.command('hafiza', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  const memories = db.prepare(`
    SELECT id, category, importance, memory FROM memories
    WHERE telegram_id = ?
    ORDER BY importance DESC, id DESC
    LIMIT 30
  `).all(String(ctx.from.id));

  if (!memories.length) {
    return ctx.reply('Henüz güçlü hafıza yok.');
  }

  await ctx.reply(
    memories.map(m => `${m.id}) [${m.category}/${m.importance}] ${m.memory}`).join('\n')
  );
});

bot.action('mood_ready', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();
  await sendVoiceTextButtons(ctx, `Güzel ${USER_TITLE}. Şimdi kaçmadan tek hamle seçiyoruz. Hangisiyle başlıyoruz?`, businessButtons);
});

bot.action('mood_10min', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();
  await sendVoiceTextButtons(ctx, `Tamam ${USER_TITLE}. 10 dakika veriyorum ama sonra kaçış yok. Döndüğünüzde ilk görevi seçiyoruz.`, mainMenuButtons);
});

bot.action('mood_low', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();
  await sendVoiceTextButtons(ctx, `Anlıyorum ${USER_TITLE}. Moral düşükse büyük hedef değil, küçük zafer alacağız. Sadece 15 dakikalık görev seçelim.`, businessButtons);
});

bot.action('task_ad_copy', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();
  await sendVoiceTextButtons(ctx, `Reklam metniyle başlıyoruz ${USER_TITLE}. Hangi ürün için yazıyoruz? Sesli söyleyin, ben metne ve plana çevireceğim.`);
});

bot.action('task_product_page', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();
  await sendVoiceTextButtons(ctx, `Ürün sayfasını geliştirelim ${USER_TITLE}. Başlık, açıklama veya görsel tarafında hangisi zayıf? Sesli anlatın.`);
});

bot.action('task_social_idea', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();
  await sendVoiceTextButtons(ctx, `Sosyal medya fikri çıkarıyoruz ${USER_TITLE}. Bugünkü hedef satış mı, etkileşim mi, güven oluşturmak mı?`);
});

bot.action('task_ai_suggest', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  await ctx.answerCbQuery();

  const suggestion = await coachReply(
    String(ctx.from.id),
    'Bugün benim için en doğru küçük iş görevini sen seç. Kısa, net ve uygulanabilir olsun.'
  );

  await sendVoiceTextButtons(ctx, suggestion, businessButtons);
});

bot.on('voice', async (ctx) => {
  if (!onlyOwner(ctx)) return ctx.reply('Bu bot özel kullanım içindir.');

  const voice = ctx.message.voice;
  const filePath = await downloadTelegramFile(voice.file_id);

  try {
    const text = await transcribeAudio(filePath);

    // Ara mesaj yok:
    // - "Sesini aldım..." yok
    // - "Sen dedin ki..." yok
    // - "Aldım..." yok
    // Sadece final cevap ses + metin olarak gider.
    await handleUserText(ctx, text);
  } catch (err) {
    console.error('Ses işleme hatası:', err);
    await ctx.reply(`Ses işlenirken hata oldu ${USER_TITLE}. Tekrar gönderin.`);
  } finally {
    safeUnlink(filePath);
  }
});

bot.on('text', async (ctx) => {
  if (!onlyOwner(ctx)) return;

  const text = ctx.message.text;

  if (text.startsWith('/')) return;

  await handleUserText(ctx, text);
});

// Sabah 09:00
cron.schedule('0 9 * * *', async () => {
  if (!OWNER_ID) return;

  await sendVoiceTextButtons(bot.telegram, `
Günaydın ${USER_TITLE}.

Bugün kaçamazsınız. 4 soruya sesli cevap verin:

1. Bugünün ana hedefi ne?
2. Para kazandıracak iş ne?
3. En çok neyi erteliyorsunuz?
4. İlk 30 dakikada neyi bitireceksiniz?
`, mainMenuButtons);
}, { timezone: TZ });

// Öğlen 12:30
cron.schedule('30 12 * * *', async () => {
  if (!OWNER_ID) return;

  await sendVoiceTextButtons(bot.telegram, `
${USER_TITLE}, öğlen kontrolü.

Sabah seçtiğiniz ana görevde ilerleme var mı?
Yoksa şimdi 25 dakika sadece ona giriyoruz.
`, businessButtons);
}, { timezone: TZ });

// Öğleden sonra 15:30
cron.schedule('30 15 * * *', async () => {
  if (!OWNER_ID) return;

  await sendVoiceTextButtons(
    bot.telegram,
    `${USER_TITLE}, bugün iş tarafında bir hamle yapalım. Hangisini seçiyoruz?`,
    businessButtons
  );
}, { timezone: TZ });

// Akşam 21:30
cron.schedule('30 21 * * *', async () => {
  if (!OWNER_ID) return;

  await sendVoiceTextButtons(bot.telegram, `
Akşam kontrolü ${USER_TITLE}.

Bugün ne tamamlandı?
Ne ertelendi?
Yarın ilk yapacağınız iş ne?

Sesli cevap verin.
`, mainMenuButtons);
}, { timezone: TZ });

bot.catch((err) => console.error('Bot hatası:', err));

bot.launch();

console.log(`${BOT_NAME} çalışıyor. Timezone: ${TZ}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));