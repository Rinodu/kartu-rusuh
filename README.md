# Kartu Rusuh

Game kartu multiplayer untuk 2–8 pemain. Ada **Mode Klasik** dan **Mode Neraka** dengan tujuh kartu power up berilustrasi AI. Host bisa memilih power up yang masuk dek sebelum membuat room.

## Main di PC sendiri

1. Pasang [Node.js 24 atau lebih baru](https://nodejs.org/).
2. Buka folder ini, lalu jalankan `start.bat` di Windows atau `npm start` di terminal.
3. Buka `http://127.0.0.1:3000` di browser.
4. Isi nama, pilih mode dan kartu, lalu buat room. Bagikan link room setelah server bisa diakses teman.

Tidak perlu `npm install`. Server hanya memakai modul bawaan Node.js. Skor kemenangan disimpan di `data/game.sqlite` pada PC yang menjalankan server. Room dan ronde aktif disimpan di memori, sehingga hilang ketika server dimatikan.

## Main bareng teman lewat internet

Cara termudah adalah [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) untuk sesi uji coba:

1. Jalankan game dengan `start.bat`.
2. Pasang `cloudflared` dari [situs resmi Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
3. Di terminal kedua jalankan `cloudflared tunnel --url http://127.0.0.1:3000`.
4. Buka URL `https://...trycloudflare.com` yang muncul, buat room dari URL tersebut, lalu bagikan **link room** ke teman.

Quick Tunnel memberi alamat sementara. PC dan dua terminal harus tetap menyala selama bermain. Untuk alamat tetap, gunakan Cloudflare Tunnel bernama dengan domain sendiri. Server game secara default hanya mendengarkan `127.0.0.1`, sehingga cukup diakses oleh tunnel pada PC yang sama. Untuk LAN langsung, jalankan dengan `HOST=0.0.0.0` dan atur firewall sesuai jaringan Anda.

GitHub Pages hanya dapat menayangkan file statis; server multiplayer dan SQLite tetap harus berjalan di PC. Paket ini sudah menyajikan halaman game dari server yang sama, jadi teman cukup membuka **satu link tunnel**.

## Aturan

- Cocokkan warna, angka, atau jenis kartu aksi. Kartu tanpa warna dapat dimainkan kapan saja; pemain memilih warna berikutnya.
- Giliran berlangsung 15 detik. Jika waktu habis, pemain otomatis mengambil satu kartu dan gilirannya lewat.
- Di Mode Neraka, `+100 Kiamat` dan `Instant Death` masing-masing hanya satu per dek. Target punya 9 detik untuk membalas dengan Cermin atau Perisai. `+2` berwarna cocok dapat menumpuk utang Kiamat dan memindahkannya ke pemain berikutnya.
- `+100 Kiamat` mengeliminasi target jika tidak dibalas. Game **tidak** membagikan 100 kartu fisik.
- `Bangkit` otomatis menyelamatkan pemain sekali per ronde, lalu memberi tujuh kartu baru. Jika dimainkan pada giliran biasa, kartu pertahanan terbuang tanpa efek.
- Pemain pertama yang habis kartu, atau pemain terakhir yang masih hidup, menang.

Ilustrasi semua kartu power up dapat dilihat di `/cards.html`.

## Pengembangan

Jalankan `npm test` untuk menguji aturan penting dan koneksi dua browser. Kode server ada di `server.js`, mesin aturan di `game.js`, dan tampilan di `public/`.

Nama dan desain kartu adalah orisinal untuk proyek ini. Game ini tidak berafiliasi dengan UNO atau Mattel.

