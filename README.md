# Satu Sehat on Chat!

Satu sehat on Chat! adalah transformasi Peduli Lindungi chatbot menjadi personal assistant, dibangun diatas platform satu sehat, dan fokus untuk lebih banyak menjangkau masyarakat via messaging system. Saat ini baru tersedia WhatsApp middleware

# Cara menjalankan
## Config
1. Ubah index.js pada constanta rabbitUrl dan path
2. Ubah conversation/satusehatonchatconversation.py pada parameter path dan parameters
3. Ubah web/satusehatonchatweb.py pada parameter path dan parameters
## Middleware
1. npm start
2. buka WA, scan qr code yang muncul pada console
## Conversational API
1. jalankan python conversation/satusehatonchatconversation.py (API akan terkoneksi dengan messaging queue)
2. jika ada library yang belum terinstall, silakan install terlebih dahulu
## Web client
1. jalankan python web/satusehatonchatweb.py (API akan terkoneksi dengan messaging queue dan berjalan pada port 80)
2. jika ada library yang belum terinstall, silakan install terlebih dahulu
3. pilih web server apapun, serve index.html
