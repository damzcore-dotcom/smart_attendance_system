
<style>
.phase { border-left: 3px solid; padding: 0 0 24px 20px; margin-left: 12px; }
.phase-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 99px; }
.task { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; padding: 10px 12px; border-radius: var(--border-radius-md); background: var(--color-background-secondary); border: 1px solid var(--color-border-tertiary); }
.task-icon { font-size: 15px; margin-top: 1px; flex-shrink: 0; }
.task-body { flex: 1; }
.task-title { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.task-desc { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; line-height: 1.5; }
.tag { font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 99px; display: inline-block; margin-top: 4px; }
.dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; }
.section-label { font-size: 11px; letter-spacing: 0.06em; font-weight: 500; text-transform: uppercase; color: var(--color-text-tertiary); margin: 20px 0 10px; }
</style>

<div style="padding: 4px 0 0">

<div class="section-label">Fase 1 — Fondasi NLP yang lebih kuat</div>

<div class="phase" style="border-color: #534AB7">
  <div class="phase-header">
    <div class="dot" style="background: #EEEDFE; color: #534AB7;">1</div>
    <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary)">Pemahaman Konteks & Multi-turn</span>
    <span class="badge" style="background: #EEEDFE; color: #3C3489;">Prioritas Tinggi</span>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-history" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Session memory / conversation history</div>
      <div class="task-desc">Simpan 5–10 pesan terakhir per user di Redis atau in-memory store. Chatbot perlu tahu "dia" sebelumnya ditanya apa — tanpa ini, setiap pertanyaan lanjutan ("dan bulan lalu?", "bagaimana dengan yang itu?") selalu gagal.</div>
      <span class="tag" style="background: #EEEDFE; color: #534AB7;">File baru: conversationMemory.js</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-arrows-exchange" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Resolusi referensi anafora</div>
      <div class="task-desc">Deteksi kata ganti seperti "dia", "mereka", "itu", "yang tadi" lalu resolve ke entitas dari giliran sebelumnya. Contoh: "Cek absensi Budi" → "Berapa dendanya?" → sistem tahu "dendanya" = denda Budi.</div>
      <span class="tag" style="background: #EEEDFE; color: #534AB7;">Modifikasi: localNlpService.js</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-puzzle" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Penggabungan intent multi-klausa</div>
      <div class="task-desc">Parse kalimat majemuk: "tampilkan absensi dan cuti Tarjono minggu ini" harus menghasilkan dua sub-intent sekaligus, bukan memilih salah satu.</div>
      <span class="tag" style="background: #EEEDFE; color: #534AB7;">Modifikasi: localNlpService.js</span>
    </div>
  </div>
</div>

<div class="section-label">Fase 2 — Ekstraksi entitas yang lebih canggih</div>

<div class="phase" style="border-color: #0F6E56">
  <div class="phase-header">
    <div class="dot" style="background: #E1F5EE; color: #0F6E56;">2</div>
    <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary)">Entity Recognition Lanjutan</span>
    <span class="badge" style="background: #E1F5EE; color: #085041;">Prioritas Tinggi</span>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-calendar-time" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Parser tanggal relatif yang lengkap</div>
      <div class="task-desc">Perluas dari "hari ini / kemarin / minggu lalu" ke: "3 hari lalu", "awal bulan ini", "Q1 2025", "antara tanggal 1–15 Juni", "sejak bergabung", "30 hari terakhir". Gunakan library ringan seperti chrono-node atau build sendiri dengan lookup table.</div>
      <span class="tag" style="background: #E1F5EE; color: #0F6E56;">File baru: dateParser.js</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-user-search" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Fuzzy matching nama karyawan</div>
      <div class="task-desc">Implementasi Levenshtein distance atau trigram similarity agar "Tarjoni", "Tarjono", dan "Pak Tarjono" semua resolve ke karyawan yang sama. Muat daftar nama dari DB saat startup, cache di memori.</div>
      <span class="tag" style="background: #E1F5EE; color: #0F6E56;">File baru: entityResolver.js</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-number" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Ekstraktor nilai numerik & komparator</div>
      <div class="task-desc">Deteksi pola seperti "lebih dari 3 kali terlambat", "keterlambatan di atas 30 menit", "denda melebihi 50rb" → ekstrak operator (gt/lt/eq) dan nilai untuk diteruskan ke query Prisma.</div>
      <span class="tag" style="background: #E1F5EE; color: #0F6E56;">Modifikasi: localNlpService.js</span>
    </div>
  </div>
</div>

<div class="section-label">Fase 3 — Kualitas respons</div>

<div class="phase" style="border-color: #BA7517">
  <div class="phase-header">
    <div class="dot" style="background: #FAEEDA; color: #BA7517;">3</div>
    <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary)">Response Generation yang Lebih Alami</span>
    <span class="badge" style="background: #FAEEDA; color: #854F0B;">Prioritas Menengah</span>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-template" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Template respons berbasis kondisi data</div>
      <div class="task-desc">Bedakan respons ketika data kosong ("Tidak ada keterlambatan Budi minggu ini 🎉"), satu hasil, dan banyak hasil. Tambahkan ringkasan otomatis di atas tabel: "Ditemukan 5 karyawan terlambat, total denda Rp 250.000".</div>
      <span class="tag" style="background: #FAEEDA; color: #BA7517;">Modifikasi: localNlpService.js</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-question-mark" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Clarification flow untuk input ambigu</div>
      <div class="task-desc">Ketika confidence score intent rendah (&lt;0.5) atau entitas hilang, chatbot bertanya balik dengan opsi: "Maksud Anda absensi hari ini atau minggu ini?" alih-alih menebak atau mengembalikan error.</div>
      <span class="tag" style="background: #FAEEDA; color: #BA7517;">File baru: clarificationFlow.js</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-sort-descending" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Agregasi & insight otomatis</div>
      <div class="task-desc">Untuk query ringkasan, tambahkan kalkulasi cepat di layer service: rata-rata keterlambatan, persentase kehadiran, perbandingan periode sebelumnya ("naik 12% dari bulan lalu").</div>
      <span class="tag" style="background: #FAEEDA; color: #BA7517;">File baru: analyticsAggregator.js</span>
    </div>
  </div>
</div>

<div class="section-label">Fase 4 — Pembelajaran & evaluasi</div>

<div class="phase" style="border-color: #185FA5; padding-bottom: 0">
  <div class="phase-header">
    <div class="dot" style="background: #E6F1FB; color: #185FA5;">4</div>
    <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary)">Feedback Loop & Self-improvement</span>
    <span class="badge" style="background: #E6F1FB; color: #0C447C;">Prioritas Jangka Panjang</span>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-thumb-up" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Logging confidence score + user feedback</div>
      <div class="task-desc">Simpan setiap query, intent yang dipilih, confidence score, dan (opsional) tombol 👍/👎 dari user ke tabel `chat_logs`. Data ini menjadi ground truth untuk tuning threshold dan menambah keyword baru.</div>
      <span class="tag" style="background: #E6F1FB; color: #185FA5;">DB: tabel chat_logs</span>
    </div>
  </div>

  <div class="task">
    <div class="task-icon"><i class="ti ti-adjustments" aria-hidden="true"></i></div>
    <div class="task-body">
      <div class="task-title">Admin panel tuning keyword</div>
      <div class="task-desc">Buat endpoint sederhana agar admin bisa menambah sinonim/keyword baru lewat UI tanpa restart server. Keyword disimpan di DB dan dimuat ulang secara hot-reload.</div>
      <span class="tag" style="background: #E6F1FB; color: #185FA5;">File baru: nlpConfigController.js</span>
    </div>
  </div>
</div>

</div>
