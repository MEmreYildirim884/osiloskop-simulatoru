# Değişiklik günlüğü

## v1.4.0 — ⭐ Lab 4: seri RLC basamak yanıtı (Prelab 04)
- Yeni laboratuvar deneyi: **Lab 4 — Seri RLC basamak yanıtı** (L1 = 1 mH, C1 = 4.7 nF, çıkış C1 üzerinde; 0 → V<sub>SQ</sub> kare dalga, 5 kHz). Kütüphanede ⭐ YENİ rozetiyle
- V<sub>SQ</sub> seçimi S'ye göre (3 / 5 / 7 V); jeneratörün 50 Ω'u için seçim: "R1 = R − 50 Ω" (laboratuvar gibi) ya da ideal kaynak (LTspice gibi)
- Adım adım kılavuz: az sönümlüde ilk tepe ve aşma (ROVShoot), %2 yerleşme süresi (imleçle), salınım periyodu; kritik ve aşırı sönümlüde yerleşme süresi; üç dalgayı REF ile aynı ekranda karşılaştırma
- Prelab Table 1 (Theoretical / Simulation / Experimental + hata %), ek ölçümler tablosu (Td, f<sub>d</sub>, sıfır aşmalar)
- 🧮 Teorik hesaplar: KVL → diferansiyel denklem → H(s) → ω₀, ζ, Rcrit → kökler → her durumun basamak yanıtı türetmesi, tepe/aşma/yerleşme, hazır MATLAB kodu
- 🧠 Teori: amortisör benzetmesi, enerji alışverişi, gerçek ölçekli basamak yanıtı çizimi, s-düzlemi kök çizimi, her R için hesap makinesi
- 🎖️ **Brifing** sekmesi (yalnız Lab 4): lab sırasında sorulacak teori tek sayfada. Hedef, denklem → H(s) → ω₀, ζ → Rcrit, basamak yanıtları, tepe/aşma/periyot, %2 yerleşme türetmeleri, Table 1 sonuç kartı, "Hoca sorarsa" soru-cevap, lab'da tuş tuş ne yapılacağı (devre kur, jeneratör, osiloskop, üç direnç için ölç ve yaz). Yazdır / PDF düğmesi
- Düzeltme: tezgâhta bir bileşen değişince osiloskobun uzun süre tetiklenmemesi (dalganın kayması) giderildi

## v1.3.0 — Lab 2 resimli anlatım + 🧮 Teorik hesaplar
- Lab 2 Başla sayfası: "Bu deney 1 dakikada" (araba benzetmesi) ve sinüs / üçgen için giriş-çıkış çizimleri
- Her görevde "✍️ Tabloya yaz" kutusu: Table 1'de hangi satıra ne yazılır
- Yeni sekme 🧮 Teorik hesaplar: Table 1 teori değerlerinin özeti ve her satırın adım adım hesabı (diğer devrelerde de)

## v1.2.1 — Lab 2 kılavuzu sadeleşti
- Her sayfada görev çubuğu: "Bu deneyde 4 görev var: G1 … G4", biten görev ✓ (tıklayınca o göreve gider)
- Başla sayfasında görev tablosu: her görevde ne yapılır, tabloya kaç sayı yazılır
- Sinüs çıkışı için basit açıklama (tepede çıkış 0, sıfırdan geçerken en büyük → 90° kayma); formüller katlanır kutularda
- Hazırlık 3 sayfadan 2 sayfaya indi
- Lab 2'de jeneratör genliği artık hiç değiştirilmez (hep aynı Vpp); "Jeneratörü ayarla" düğmesi kaldırıldı

## v1.2.0 — ⭐ Lab 2: op-amp türev alıcı (Prelab 02)
- Yeni laboratuvar deneyi: **Lab 2 — Op-amp türev alıcı** (R1 = 1 kΩ, C1 = 1 µF, LM741 ±15 V). Kütüphanede ⭐ YENİ rozetiyle, ilk açılışta bildirim
- Adım adım kılavuz: 1 kHz sinüste Vo,peak, 100 Hz üçgende iki çıkış seviyesi, 7 frekanslı üçgen tarama (Av = Vo,pp / Vi,pp), ilk bozulma frekansı
- Vi,peak seçimi S'ye göre (4 / 5 / 6 V), Prelab Table 1 ile aynı tablo, Word'e kopyala / CSV, teori sekmesi
- Op-amp için besleme seçeneği: ±15 V (çıkış ≈ ±13 V'ta doyar/kırpılır). Eski devreler değişmedi (ideal op-amp varsayılan)

## v1.1.0 — yakınlaştırma araçları
- Osiloskop boyutu: 🔍 − / + (%60–%250), ⤢ Sığdır, ⛶ Tam ekran
- 🔎 Büyüteç: ekranın üstünde gezdirince o bölgeyi 3× büyütür (imleçleri sıfır geçişine tam oturtmak için)
- Devre tezgâhı: yakınlaştır/uzaklaştır (tezgâha tıkla → fare tekerleği ya da − / + / ⤢ düğmeleri), boş yeri sürükleyerek kaydırma
- Kılavuz yazı boyutu: A− / A+

## v1.0.0 — ilk yayın
- GW Instek GDS-1102B ön paneli: menüler, Autoset, 36 otomatik ölçüm, imleçler, Math/FFT, XY, Average, Run/Stop, Single
- Devre tezgâhı: sürükle-bırak bileşenler, gerçek zamanlı devre çözücü, problar (×1/×10, toprak klipsi uyarısı), geri al/yinele
- 30 hazır devre: EE212 Lab 1 (Wien RC), 13 öğretmeli devre, 16 test devresi (kılavuz gizli, skorlu)
- Adım adım kılavuz (HAZIRLIK + GÖREV 1–5), teori sekmesi, rapor tabloları (Word'e kopyala / CSV)
- Ekrandaki "!" açıklama işaretleri, akıllı ipucu çubuğu
- Yüksek çözünürlüklü osiloskop ekranı (HiDPI)
- Uygulama olarak yüklenebilir (PWA), çevrimdışı çalışır, otomatik güncelleme bildirimi
