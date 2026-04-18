# yanSanayi UwUFUFU

Statik React/Vite tabanlı UwUFUFU tarzı bracket oyunu. Yerel kapaklı pack'ler offline çalışır; YouTube pack'leri statik site içinde import edilir ama embed oynatma için internet ister.

## Çalıştırma

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

`vite.config.ts` içinde `base: "./"` kullanıldığı için build sonrası `dist/index.html` statik dosya olarak açılabilir.

## Vercel / Zayıf Bağlantı

- Production build service worker kaydeder; ilk başarılı yüklemeden sonra app shell, JS/CSS bundle, manifest ve yerel kapak asset'leri cache'lenir.
- Oyun ilerlemesi seçim anında senkron `localStorage`'a yazılır; ayrıca `pagehide`, `beforeunload` ve sekme gizlenirken son oturum tekrar kaydedilir.
- Vercel için `vercel.json` cache header'ları eklenmiştir: hash'li asset'ler uzun süre, `sw.js` ve HTML ise revalidate ile servis edilir.
- Vercel deploy'da `/api/youtube-playlist` ve `/api/spotify-playlist` serverless endpoint'leri vardır. YouTube endpoint'i `yt-dlp` gerektirmez; public playlist sayfasındaki metadata'yı okur.

## Siteden Playlist'i UwUFUFU'ya Çevirme

Local server açıkken sol panelde YouTube/Spotify kaynağını seçin, playlist linkini yapıştırın, video/şarkı limitini seçin ve `URL'den kaydet` düğmesine basın. Sistem pack'i otomatik ekler, seçili hale getirir ve bu tarayıcıda `localStorage` ile saklar.

```bash
npm run dev
```

- YouTube pack'leri oynatılabilir `youtube-nocookie.com` embed panelleriyle gelir.
- Spotify pack'leri kapak kartlarıyla gelir; Spotify embed/player kullanılmaz.
- Kaydedilen desteler Pack seçicisinde kalır, bu yüzden aynı URL'yi tekrar yapıştırmanız gerekmez. Custom desteler sağ panelden silinebilir.
- Üst bardaki panel düğmeleri sol/sağ paneli kapatır; odak modu iki paneli kapatıp karşılaştırma alanını genişletir.

## İsteğe Bağlı JSON Üretme

Video indirmez; sadece `yt-dlp --flat-playlist -J` metadata'sından JSON pack üretir.

```bash
npm run import:youtube -- "https://www.youtube.com/playlist?list=PL4N9oNbOHXBVfjv_uf-DxsP34mfEM2ixW" --limit 128
```

Çıktı `data/generated/` altına yazılır. Uygulamada sağ üstteki import düğmesiyle bu JSON dosyasını seçin, sonra 8/16/32/64/128 bracket boyutlarından birini başlatın.

## Notlar

- Local kapaklı pack'lerde runtime dış ağ isteği yoktur.
- YouTube pack'lerinde iframe kaynağı `youtube-nocookie.com/embed/...` olur ve oynatma için internet gerekir.
- YouTube videoları, sesleri veya küçük resimleri repo içine indirilmez.
