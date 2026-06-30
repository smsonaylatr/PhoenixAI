import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { speak } from '../services/elevenlabs.js';
import { config } from '../config.js';

export function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export async function downloadTelegramFile(bot, fileId) {
  const fileLink = await bot.telegram.getFileLink(fileId);
  const filePath = path.resolve(`voice_${Date.now()}.ogg`);
  const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, response.data);
  return filePath;
}

export async function sendVoiceTextButtons(bot, target, text, buttons = []) {
  let voicePath;

  try {
    voicePath = await speak(text);

    if (target.replyWithVoice) {
      await target.replyWithVoice({ source: voicePath });
    } else {
      await bot.telegram.sendVoice(config.ownerId, { source: voicePath });
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
            row.map(btn => ({ text: btn.text, callback_data: btn.data }))
          )
        }
      }
    : undefined;

  if (target.reply) return target.reply(text, payload);
  return bot.telegram.sendMessage(config.ownerId, text, payload);
}
