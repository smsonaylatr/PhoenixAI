import cron from 'node-cron';
import { config } from '../config.js';
import { mainMenuButtons, businessButtons } from '../telegram/buttons.js';
import { sendVoiceTextButtons } from '../telegram/voice.js';

export function registerJobs(bot) {
  cron.schedule('0 9 * * *', async () => {
    if (!config.ownerId) return;
    await sendVoiceTextButtons(bot, bot.telegram, `
Günaydın ${config.userTitle}.

Bugün kaçamazsınız. 4 soruya sesli cevap verin:

1. Bugünün ana hedefi ne?
2. Para kazandıracak iş ne?
3. En çok neyi erteliyorsunuz?
4. İlk 30 dakikada neyi bitireceksiniz?
`, mainMenuButtons);
  }, { timezone: config.timezone });

  cron.schedule('30 12 * * *', async () => {
    if (!config.ownerId) return;
    await sendVoiceTextButtons(bot, bot.telegram, `
${config.userTitle}, öğlen kontrolü.

Sabah seçtiğiniz ana görevde ilerleme var mı?
Yoksa şimdi 25 dakika sadece ona giriyoruz.
`, businessButtons);
  }, { timezone: config.timezone });

  cron.schedule('30 15 * * *', async () => {
    if (!config.ownerId) return;
    await sendVoiceTextButtons(bot, bot.telegram, `${config.userTitle}, bugün iş tarafında bir hamle yapalım. Hangisini seçiyoruz?`, businessButtons);
  }, { timezone: config.timezone });

  cron.schedule('30 21 * * *', async () => {
    if (!config.ownerId) return;
    await sendVoiceTextButtons(bot, bot.telegram, `
Akşam kontrolü ${config.userTitle}.

Bugün ne tamamlandı?
Ne ertelendi?
Yarın ilk yapacağınız iş ne?

Sesli cevap verin.
`, mainMenuButtons);
  }, { timezone: config.timezone });
}
