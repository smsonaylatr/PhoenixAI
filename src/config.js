import 'dotenv/config';

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  ownerId: String(process.env.OWNER_TELEGRAM_ID || ''),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '',
  elevenlabsModelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
  timezone: process.env.TZ || 'Europe/Istanbul',
  botName: process.env.BOT_NAME || 'Phoenix AI',
  userTitle: process.env.USER_TITLE || 'Aslan Bey'
};

export function validateEnv() {
  const required = {
    TELEGRAM_BOT_TOKEN: config.telegramToken,
    OPENAI_API_KEY: config.openaiApiKey,
    ELEVENLABS_API_KEY: config.elevenlabsApiKey,
    ELEVENLABS_VOICE_ID: config.elevenlabsVoiceId
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    console.warn(`UYARI: .env içinde eksik değişkenler: ${missing.join(', ')}`);
  }
}
