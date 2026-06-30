# Phoenix AI v1.0

Aslan Bey için Telegram üzerinde çalışan sesli yapay zeka yaşam koçu botu.

## Özellikler

- Telegram sesli mesaj alır.
- OpenAI ile sesi yazıya çevirir.
- OpenAI ile koç cevabı üretir.
- ElevenLabs ile sesli cevap gönderir.
- Önemli soruları önce sesli okur, sonra metin + buton gönderir.
- Inline butonlarla seçim yaptırır.
- Görevleri SQLite veritabanına kaydeder.
- Basit uzun süreli hafıza tutar.
- Sabah, öğlen, öğleden sonra ve akşam otomatik yoklama yapar.
- Standart hitap: Aslan Bey.

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` dosyasını doldurun.

Sonra çalıştırın:

```bash
npm run dev
```

Üretimde:

```bash
npm start
```

## Telegram ID bulma

Bot çalışınca Telegram'dan:

```text
/id
```

yazın. Çıkan ID'yi `.env` içindeki `OWNER_TELEGRAM_ID` alanına koyun ve botu yeniden başlatın.

## Komutlar

```text
/start   Phoenix AI başlat
/id      Telegram ID göster
/gunluk  Günlük 4 soru
/gorevler Açık görevler
/tamam ID Görevi tamamla
/rapor   Gün raporu
/hafiza  Kayıtlı güçlü hafızalar
```

## Önemli güvenlik notu

Daha önce Telegram bot token veya API anahtarı açık yerde paylaşıldıysa mutlaka yenileyin.
Bot token için BotFather → `/revoke` veya yeni token oluşturma yolunu kullanın.

## Çalışma akışı

```text
Telegram sesli mesaj
→ OpenAI transcribe
→ Phoenix AI koç beyni
→ Hafıza + görev çıkarımı
→ ElevenLabs ses üretimi
→ Telegram sesli cevap + metin + buton
```

## Plesk / sunucu önerisi

Node.js 20+ kullanın. Proje klasöründe `.env` oluşturup `npm install` ve `npm start` ile başlatın.
PM2 kullanırsanız:

```bash
npm i -g pm2
pm2 start src/index.js --name phoenix-ai
pm2 save
```
"# PhoenixAI" 
