import { db } from '../database.js';
import { config } from '../config.js';
import { processUserMessage, coachReply } from '../brain/coach.js';
import { addMemory, getSetting, setSetting } from '../brain/memory.js';
import { transcribeAudio } from '../services/openai.js';
import { businessButtons, mainMenuButtons, modeButtons } from './buttons.js';
import { downloadTelegramFile, safeUnlink, sendVoiceTextButtons } from './voice.js';

function onlyOwner(ctx) {
  if (!config.ownerId) return true;
  return String(ctx.from?.id) === config.ownerId;
}

async function finalReply(bot, ctx, text, buttons = mainMenuButtons) {
  await sendVoiceTextButtons(bot, ctx, text, buttons);
}

export function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!onlyOwner(ctx)) return ctx.reply('Bu bot özel kullanım içindir.');

    const telegramId = String(ctx.from.id);

    db.prepare(`
      INSERT OR IGNORE INTO users (telegram_id, name)
      VALUES (?, ?)
    `).run(telegramId, ctx.from.first_name || config.userTitle);

    addMemory(telegramId, `Kullanıcıya ${config.userTitle} diye hitap edilecek.`, 'identity', 100);

    await finalReply(bot, ctx, `
${config.botName} v3 aktif ${config.userTitle}.

Komutlar:
/gunluk - Günlük 4 soru
/gorevler - Açık görevler
/tamam ID - Görevi tamamla
/rapor - Gün özeti
/hafiza - Güçlü hafızalar
/hedef hedef metni - Hedef kaydet
/proje proje notu - Proje hafızası ekle
/mod - Çalışma modu seç
/dusun - Phoenix öneri üretsin
/haftalik - Haftalık rapor
/id - Telegram ID göster

Başlayalım mı?
`, mainMenuButtons);
  });

  bot.command('id', async (ctx) => ctx.reply(`Telegram ID: ${ctx.from.id}`));

  bot.command('gunluk', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await finalReply(bot, ctx, `
${config.userTitle}, bugünkü 4 soruyu sesli cevaplayın:

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
      return finalReply(bot, ctx, `Açık görevin yok ${config.userTitle}. Yeni hedef belirleyelim.`, businessButtons);
    }

    await ctx.reply(tasks.map(t => `${t.id}) ${t.task}`).join('\n'));
  });

  bot.command('tamam', async (ctx) => {
    if (!onlyOwner(ctx)) return;

    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('Kullanım: /tamam 12');

    db.prepare(`
      UPDATE tasks
      SET status = 'done', done_at = CURRENT_TIMESTAMP
      WHERE id = ? AND telegram_id = ?
    `).run(id, String(ctx.from.id));

    await finalReply(bot, ctx, `Güzel iş ${config.userTitle}. Görev tamamlandı. ID: ${id}`, mainMenuButtons);
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

    await finalReply(bot, ctx, `
Günlük rapor ${config.userTitle}.

Tamamlanan görev: ${done}
Açık görev: ${pending}
Aktif mod: ${getSetting(telegramId, 'mode', 'coach')}

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

    if (!memories.length) return ctx.reply('Henüz güçlü hafıza yok.');
    await ctx.reply(memories.map(m => `${m.id}) [${m.category}/${m.importance}] ${m.memory}`).join('\n'));
  });

  bot.command('hedef', async (ctx) => {
    if (!onlyOwner(ctx)) return;

    const hedef = ctx.message.text.replace('/hedef', '').trim();
    if (!hedef) return ctx.reply('Kullanım: /hedef Bu ay Phoenix AI v3 tamamlanacak');

    addMemory(String(ctx.from.id), hedef, 'goal', 95);
    await finalReply(bot, ctx, `Hedef kaydedildi ${config.userTitle}: ${hedef}`, mainMenuButtons);
  });

  bot.command('proje', async (ctx) => {
    if (!onlyOwner(ctx)) return;

    const proje = ctx.message.text.replace('/proje', '').trim();
    if (!proje) return ctx.reply('Kullanım: /proje Patenli Ayakkabılar ürün sayfası geliştirilecek');

    addMemory(String(ctx.from.id), proje, 'project', 90);
    await finalReply(bot, ctx, `Proje hafızasına aldım ${config.userTitle}: ${proje}`, businessButtons);
  });

  bot.command('mod', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await finalReply(bot, ctx, `Hangi modda çalışalım ${config.userTitle}?`, modeButtons);
  });

  bot.command('dusun', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    const suggestion = await coachReply(String(ctx.from.id), 'Mevcut hedeflerime, projelerime ve açık görevlerime göre bugün en akıllıca hamleyi sen öner.');
    await finalReply(bot, ctx, suggestion, businessButtons);
  });

  bot.command('haftalik', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    const report = await coachReply(String(ctx.from.id), 'Son hafızama ve görevlerime göre haftalık gelişim raporu hazırla. Kazanımlar, aksayanlar ve gelecek hafta 3 net görev ver.');
    await finalReply(bot, ctx, report, mainMenuButtons);
  });

  const modeMap = {
    mode_coach: 'coach',
    mode_discipline: 'discipline',
    mode_ceo: 'ceo',
    mode_developer: 'developer',
    mode_marketing: 'marketing'
  };

  for (const [action, mode] of Object.entries(modeMap)) {
    bot.action(action, async (ctx) => {
      if (!onlyOwner(ctx)) return;
      await ctx.answerCbQuery();
      setSetting(String(ctx.from.id), 'mode', mode);
      await finalReply(bot, ctx, `Mod değişti ${config.userTitle}: ${mode}`, mainMenuButtons);
    });
  }

  bot.action('mood_ready', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    await finalReply(bot, ctx, `Güzel ${config.userTitle}. Şimdi kaçmadan tek hamle seçiyoruz. Hangisiyle başlıyoruz?`, businessButtons);
  });

  bot.action('mood_10min', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    await finalReply(bot, ctx, `Tamam ${config.userTitle}. 10 dakika veriyorum ama sonra kaçış yok.`, mainMenuButtons);
  });

  bot.action('mood_low', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    await finalReply(bot, ctx, `Anlıyorum ${config.userTitle}. Moral düşükse büyük hedef değil, küçük zafer alacağız.`, businessButtons);
  });

  bot.action('task_ad_copy', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    await finalReply(bot, ctx, `Reklam metniyle başlıyoruz ${config.userTitle}. Hangi ürün için yazıyoruz? Sesli söyleyin.`, undefined);
  });

  bot.action('task_product_page', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    await finalReply(bot, ctx, `Ürün sayfasını geliştirelim ${config.userTitle}. Başlık, açıklama veya görsel tarafında hangisi zayıf?`, undefined);
  });

  bot.action('task_social_idea', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    await finalReply(bot, ctx, `Sosyal medya fikri çıkarıyoruz ${config.userTitle}. Hedef satış mı, etkileşim mi, güven mi?`, undefined);
  });

  bot.action('task_ai_suggest', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    await ctx.answerCbQuery();
    const suggestion = await coachReply(String(ctx.from.id), 'Bugün benim için en doğru küçük iş görevini sen seç. Kısa, net ve uygulanabilir olsun.');
    await finalReply(bot, ctx, suggestion, businessButtons);
  });

  bot.on('voice', async (ctx) => {
    if (!onlyOwner(ctx)) return ctx.reply('Bu bot özel kullanım içindir.');

    const filePath = await downloadTelegramFile(bot, ctx.message.voice.file_id);

    try {
      const text = await transcribeAudio(filePath);
      const reply = await processUserMessage(String(ctx.from.id), text);
      await finalReply(bot, ctx, reply, mainMenuButtons);
    } catch (err) {
      console.error('Ses işleme hatası:', err);
      await ctx.reply(`Ses işlenirken hata oldu ${config.userTitle}. Tekrar gönderin.`);
    } finally {
      safeUnlink(filePath);
    }
  });

  bot.on('text', async (ctx) => {
    if (!onlyOwner(ctx)) return;
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const reply = await processUserMessage(String(ctx.from.id), text);
    await finalReply(bot, ctx, reply, mainMenuButtons);
  });
}
