# NumTest CPNS — Full-Stack Refactor v2.0

Platform simulasi Numerical Reasoning Test untuk persiapan CPNS dengan arsitektur full-stack yang benar dan production-level.

---

## 🔄 PERUBAHAN UTAMA (BEFORE vs AFTER)

### 1. Question Generation — Backend Only

| BEFORE | AFTER |
|--------|-------|
| `generateLocalQuestions()` di frontend | **Dihapus total dari frontend** |
| Backend `/questions` dipanggil tapi tidak dipakai | `POST /api/test/start` — server generate, store, dan return soal sanitized |
| Jawaban ada di frontend | **Jawaban tidak pernah dikirim ke client** |

**Flow baru:**
```
Client → POST /api/test/start { difficulty }
Server → generateQuestions() → simpan ke TestSessionStore (server-side)
Server → return { sessionToken, questions (tanpa answer), timeLimit }
Client → tampilkan soal, kumpulkan jawaban
Client → POST /api/test/submit { sessionToken, answers, duration }
Server → ambil questions dari store → grade → return { results, correctAnswers, score }
```

### 2. Server-Side Answer Validation

| BEFORE | AFTER |
|--------|-------|
| Skor dihitung di frontend | Semua grading di backend |
| Frontend mengirim `questions[].answer` ke backend | Server mengambil jawaban dari `TestSessionStore` |
| Rentan cheat (inspect DevTools) | Anti-cheat: client tidak pernah tau jawaban |

### 3. Level Progression System

| BEFORE | AFTER |
|--------|-------|
| Label easy/medium/hard saja | Unlock system berbasis akurasi |
| Tidak ada gating | Easy selalu terbuka; Medium: ≥70% di Easy; Hard: ≥80% di Medium |
| `level` integer di DB | `level_unlocked`, `easy_best_accuracy`, `medium_best_accuracy` di DB |

**Endpoint baru:** `GET /api/test/difficulties` — returns unlock status per user.

### 4. Matchmaking Queue — Supabase-Backed

| BEFORE | AFTER |
|--------|-------|
| `const matchmakingQueue = new Map()` — in-memory | **Supabase table `matchmaking_queue`** |
| Hilang saat server restart | Persisten, scalable |
| Tidak bisa multi-instance | Siap untuk horizontal scaling |

**Flow baru:**
```
User join → INSERT INTO matchmaking_queue
Server scan → SELECT 2 oldest entries
Match → DELETE kedua entries → buat room
```

### 5. Multiplayer Results Persistence

| BEFORE | AFTER |
|--------|-------|
| Ada tabel tapi tidak selalu terisi | Insert ke `multiplayer_matches` setiap match selesai |
| Stats tidak konsisten | Update `wins`, `losses`, `total_matches` atomik |
| Tidak ada test_history untuk multiplayer | Insert ke `test_history` dengan `mode='multiplayer'` |

### 6. Real-Time Score Update

| BEFORE | AFTER |
|--------|-------|
| `match:scoreUpdate` hanya di room | `score:update` ke seluruh room setiap jawaban dikirim |
| Leaderboard tidak diupdate setelah match | `leaderboard:update` broadcast ke semua client setelah match selesai |

### 7. Security & Rate Limiting

| BEFORE | AFTER |
|--------|-------|
| Tidak ada rate limiting | `express-rate-limit`: 100 req/15min (API), 10 req/15min (auth), 20 req/5min (submit) |
| Tidak ada helmet | `helmet` security headers aktif |
| JWT error tidak detail | Token distinguishing: JWT error vs expired vs invalid signature |
| Semua endpoint optional auth | Protected endpoints wajib `authenticate` middleware |

### 8. Database Schema

| BEFORE | AFTER |
|--------|-------|
| `level INTEGER` | `level_unlocked INTEGER`, `easy_best_accuracy INTEGER`, `medium_best_accuracy INTEGER` |
| Tidak ada index untuk query berat | Index di semua kolom yang sering di-query |
| `matchmaking_queue` tidak dipakai | Digunakan sebagai persistent queue |
| Tidak ada view | `leaderboard_view` untuk query ranking mudah |

### 9. Error Handling

| BEFORE | AFTER |
|--------|-------|
| Banyak `catch { /* ignore */ }` | Setiap error di-log dan dikembalikan ke client dengan pesan jelas |
| Frontend tidak menampilkan error | Error message ditampilkan ke user via toast |
| Backend tidak validasi input | Input validation di setiap endpoint |

### 10. Frontend Architecture

| BEFORE | AFTER |
|--------|-------|
| Business logic di frontend (scoring, question gen) | Frontend = pure UI layer |
| `generateLocalQuestions()` = duplikasi backend | Dihapus total |
| Fallback ke local generator | Tidak ada fallback — jika backend down, tampilkan error |
| `correct_answer` ada di client memory | Tidak ada, server return setelah submit |

---

## 📁 Struktur Project

```
numtest-refactored/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── supabase.js          ← Supabase admin + public client
│   │   ├── middleware/
│   │   │   ├── auth.js              ← JWT + Supabase token verification
│   │   │   └── rateLimiter.js       ← express-rate-limit configs
│   │   ├── routes/
│   │   │   ├── auth.js              ← Register, login, Google OAuth, /me
│   │   │   ├── test.js              ← /start, /submit, /history, /difficulties
│   │   │   └── user.js              ← Profile, stats, leaderboard, history
│   │   ├── services/
│   │   │   └── testSessionStore.js  ← Anti-cheat: server-side session storage
│   │   ├── sockets/
│   │   │   └── matchmaking.js       ← Socket.IO handlers, Supabase queue
│   │   ├── utils/
│   │   │   └── questionGenerator.js ← 11 pola soal, difficulty configs
│   │   └── server.js                ← Express + helmet + rate limit + Socket.IO
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── services/
│       │   ├── api.js               ← Pure HTTP client, no business logic
│       │   ├── auth.js              ← Client-side auth state management
│       │   └── socket.js            ← Socket.IO wrapper
│       ├── utils/
│       │   ├── store.js             ← sessionStorage wrapper
│       │   └── helpers.js           ← UI utilities only
│       ├── components/
│       │   └── navbar.js            ← Navbar renderer
│       ├── pages/
│       │   ├── home.js              ← Landing page
│       │   ├── auth.js              ← Login + Register
│       │   ├── test.js              ← Test engine (NO local generation)
│       │   ├── results.js           ← Display server results
│       │   ├── multiplayer.js       ← Real-time game (reactive to server)
│       │   ├── profile.js           ← User stats + level progress
│       │   └── leaderboard.js       ← Global rankings + real-time update
│       ├── styles/
│       │   └── main.css
│       └── index.html               ← SPA shell + router
│
└── database/
    └── schema.sql                   ← Production schema v2
```

---

## 🚀 Setup & Deployment

### Prerequisites
- Node.js ≥ 18
- Supabase project (free tier cukup)

### 1. Database Setup
```sql
-- Di Supabase SQL Editor, jalankan:
-- database/schema.sql
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env dengan kredensial Supabase dan JWT secret
npm run dev
```

### 3. Frontend Setup
Edit `frontend/index.html` — ganti APP_CONFIG:
```javascript
window.APP_CONFIG = {
  API_URL: 'https://your-backend.onrender.com/api',
  SOCKET_URL: 'https://your-backend.onrender.com',
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key'
};
```

Serve frontend dengan static file server (Netlify, Vercel, dsb.).

### 4. Environment Variables (Backend)
```env
PORT=3001
NODE_ENV=production
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
JWT_SECRET=min-32-chars-random-string
CLIENT_URL=https://your-frontend.netlify.app
```

---

## 🔐 API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | - | Register baru |
| POST | `/api/auth/login` | - | Login email |
| POST | `/api/auth/google` | - | Login Google OAuth |
| GET | `/api/auth/me` | ✓ | User info + stats |

### Test
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/test/difficulties` | optional | Difficulty configs + unlock status |
| POST | `/api/test/start` | optional | **Generate soal (server-side)**, return sessionToken |
| POST | `/api/test/submit` | optional | **Grade jawaban (server-side)**, return results |
| GET | `/api/test/history` | ✓ | Riwayat test user |

### User
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user/profile` | ✓ | Profile user |
| PATCH | `/api/user/profile` | ✓ | Update username |
| GET | `/api/user/stats` | ✓ | Statistik + best per difficulty |
| GET | `/api/user/leaderboard` | - | Global leaderboard |
| GET | `/api/user/history` | ✓ | Riwayat test |

### Socket Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `matchmaking:join` | C→S | Join queue |
| `matchmaking:waiting` | S→C | Queue position |
| `matchmaking:matched` | S→C | Match found, soal dikirim |
| `match:countdown` | S→C | 3,2,1,GO |
| `match:start` | S→C | Match dimulai, endTime dikirim |
| `match:answer` | C→S | Submit jawaban |
| `match:answerFeedback` | S→C | Hasil + correct answer revealed |
| `score:update` | S→C (room) | Live score update |
| `match:end` | S→C (room) | Match selesai + hasil |
| `leaderboard:update` | S→C (all) | Global leaderboard refresh |

---

## 🧠 Arsitektur Anti-Cheat

```
1. Client POST /api/test/start { difficulty }
   └─ Server: generateQuestions() → store di TestSessionStore (server memory)
   └─ Return: { sessionToken (opaque), questions (NO answers), timeLimit }

2. Client mengerjakan soal (tidak tahu jawaban)
   └─ Saat pilih jawaban → store di answers[]
   └─ Tidak ada cara untuk tahu jawaban benar dari DevTools

3. Client POST /api/test/submit { sessionToken, answers[], duration }
   └─ Server: testSessionStore.get(sessionToken) → ambil soal + jawaban benar
   └─ Server: grade di server → return { score, results (answers revealed), ... }
   └─ Session ditandai submitted → tidak bisa submit ulang

4. Correct answers HANYA dikirim setelah submit (di results page)
```

---

## 📊 Level Progression Logic

```
Easy    → Selalu unlocked
Medium  → Unlock jika easy_best_accuracy >= 70
Hard    → Unlock jika medium_best_accuracy >= 80

Disimpan di user_stats:
- level_unlocked: 1|2|3
- easy_best_accuracy: 0-100
- medium_best_accuracy: 0-100

Endpoint /api/test/start enforce lock:
- Jika user pilih 'hard' tapi level_unlocked < 3 → 403 Forbidden
```

---

*Dibuat untuk tugas Advanced Full-Stack Web Application — Teknik Informatika Unsil*
