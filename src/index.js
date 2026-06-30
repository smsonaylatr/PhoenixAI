import { Telegraf } from 'telegraf';
import { config, validateEnv } from './config.js';
import { migrate } from './database.js';
import { registerHandlers } from './telegram/handlers.js';
import { registerJobs } from './scheduler/jobs.js';

validateEnv();
migrate();

const bot = new Telegraf(config.telegramToken);

registerHandlers(bot);
registerJobs(bot);

bot.catch((err) => console.error('Bot hatası:', err));

bot.launch();
console.log(`${config.botName} v3 çalışıyor. Timezone: ${config.timezone}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
