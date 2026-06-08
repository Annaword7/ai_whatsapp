# AI WhatsApp Web Client

A mobile-first PWA that links a WhatsApp account (via [Baileys](https://github.com/WhiskeySockets/Baileys), the WhatsApp Web reverse-engineered protocol) and layers AI on top:

- 🔄 **Auto-translate inbound messages** (per-chat toggle)
- ✍️ **Translate outbound** messages before sending (with original/translated preview)
- 🤖 **AI assist**: generate a reply, make it professional, make it shorter, translate to the contact's language
- 💬 **Messenger-style chat UI**, realtime over WebSocket, works in a phone browser

> ⚠️ **Disclaimer.** This uses an unofficial WhatsApp protocol. It is not affiliated with or endorsed by WhatsApp/Meta, and automating a WhatsApp account may violate their Terms of Service and risk a ban. Use a number you can afford to lose and only for accounts you own.

---

## Architecture

```
WA web/
├── server/                 # Backend — Fastify + Baileys + Prisma + OpenAI
│   ├── src/
│   │   ├── whatsapp/        # Baileys integration, encrypted auth state, reconnect
│   │   ├── routes/          # REST API (session, chats, messages, ai)
│   │   ├── services/        # ai / chat / message business logic
│   │   ├── ws/              # WebSocket hub + endpoint
│   │   ├── db/              # Prisma client
│   │   ├── config/          # env validation (zod)
│   │   └── utils/           # logger, crypto (AES-256-GCM)
│   ├── prisma/              # schema + baseline migration
│   └── Dockerfile
├── web/                     # Frontend — Next.js (App Router) + Tailwind + PWA
│   ├── app/                 # /, /connect, /chat/[id], manifest
│   ├── components/          # ChatList, ChatHeader, MessageList, AIPanel, Composer …
│   ├── stores/              # zustand store
│   ├── hooks/               # useWebSocket
│   ├── lib/                 # api client, types, utils
│   └── Dockerfile
└── docker-compose.yml       # Local stack: Postgres + server + web
```

**Data flow:** Baileys events → `WhatsAppManager` → persist via Prisma → broadcast over the WebSocket hub → the browser store updates in realtime. The REST API serves history and handles sending + AI calls.

### Tech
- **Backend:** Node 20+, TypeScript (strict), Fastify 5, `@fastify/websocket`, Baileys, Prisma 5, OpenAI SDK, pino, zod.
- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS, zustand, lucide-react. Installable PWA.
- **DB:** PostgreSQL. Models: `UserSession`, `Chat`, `Message`, `Contact`.

### WhatsApp session stability
- Auth state is persisted on the filesystem and **encrypted at rest** (AES-256-GCM via `SESSION_ENCRYPTION_KEY`).
- Automatic reconnect with exponential backoff; distinguishes `loggedOut` / `connectionReplaced` from transient drops.
- On boot, a previously paired session auto-reconnects (no new QR) if its auth folder is present — keep `WA_SESSION_PATH` on a persistent volume.

---

## API reference

| Method | Path | Description |
| --- | --- | --- |
| `GET`  | `/api/health` | Health + AI config flag |
| `POST` | `/api/session/connect` | Start the WhatsApp socket (returns status/QR) |
| `GET`  | `/api/session/status` | Current status + QR data URL |
| `POST` | `/api/session/disconnect` | Stop socket, keep session |
| `POST` | `/api/session/logout` | Log out and wipe auth state |
| `GET`  | `/api/chats` | List chats |
| `GET`  | `/api/chats/:id` | Chat detail |
| `PATCH`| `/api/chats/:id` | Update `{ autoTranslate, translateTo, contactLang }` |
| `GET`  | `/api/chats/:id/messages?limit=` | Message history |
| `POST` | `/api/chats/:id/messages` | Send `{ text, translateTo? }` |
| `POST` | `/api/ai/translate` | `{ text, targetLanguage }` → `{ translation }` |
| `POST` | `/api/ai/detect` | `{ text }` → `{ language }` |
| `POST` | `/api/ai/reply` | `{ chatId, style?, language? }` → `{ reply }` |
| `POST` | `/api/ai/improve` | `{ text, style, language? }` → `{ text }` |
| `WS`   | `/ws` | Realtime: `status` / `chat` / `message` / `message:update` |

---

## Run locally

### Option A — Docker (one command)

```bash
cp .env.example .env          # set OPENAI_API_KEY + SESSION_ENCRYPTION_KEY
docker compose up --build
```

- Web → http://localhost:3000
- API → http://localhost:8080

### Option B — Native (best for development)

**1. Database** (Docker is easiest):
```bash
docker compose up db -d
```

**2. Backend:**
```bash
cd server
cp .env.example .env          # set DATABASE_URL, OPENAI_API_KEY, SESSION_ENCRYPTION_KEY
#   DATABASE_URL=postgresql://aiwa:aiwa@localhost:5432/aiwa?schema=public
npm install
npm run prisma:migrate        # creates tables (first run)
npm run dev                   # http://localhost:8080
```

**3. Frontend:**
```bash
cd web
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev                    # http://localhost:3000
```

**4. Link WhatsApp:** open http://localhost:3000 → **Connect** → scan the QR with
WhatsApp → *Settings → Linked devices → Link a device*. Chats sync and messages
stream in realtime.

> 📱 To use it from your phone on the same Wi-Fi, set `NEXT_PUBLIC_API_URL` /
> `NEXT_PUBLIC_WS_URL` to your machine's LAN IP (e.g. `http://192.168.1.50:8080`)
> and set the backend `CORS_ORIGIN` accordingly.

### Environment variables (backend)

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `OPENAI_API_KEY` | for AI | `''` | Server boots without it; AI endpoints 503 until set |
| `OPENAI_MODEL` | | `gpt-4o-mini` | Any chat-completions model |
| `WA_SESSION_PATH` | | `./.sessions` | Auth state dir — **mount a volume in prod** |
| `SESSION_ENCRYPTION_KEY` | ✅ (prod) | dev fallback | Encrypts auth state at rest |
| `CORS_ORIGIN` | | `*` | Web origin(s), comma-separated |
| `DEFAULT_TRANSLATE_TO` | | `en` | Default inbound translation language |
| `PORT` / `HOST` | | `8080` / `0.0.0.0` | |

---

## Deploy to Railway

Deploy the **backend** and **web** as two services in one Railway project, plus the PostgreSQL plugin.

### 1. PostgreSQL
Project → **New** → **Database** → **PostgreSQL**. Railway exposes `DATABASE_URL`.

### 2. Backend service
1. **New** → **GitHub Repo** (or Empty Service) → set **Root Directory** to `server`.
   Railway auto-detects the `Dockerfile`.
2. **Variables:**
   - `DATABASE_URL` → reference the Postgres plugin: `${{Postgres.DATABASE_URL}}`
   - `OPENAI_API_KEY` → your key
   - `OPENAI_MODEL` → `gpt-4o-mini` (optional)
   - `SESSION_ENCRYPTION_KEY` → a long random secret
   - `WA_SESSION_PATH` → `/app/.sessions`
   - `CORS_ORIGIN` → your web service URL (e.g. `https://your-web.up.railway.app`)
3. **Volume:** add a Volume mounted at `/app/.sessions` so the WhatsApp session
   survives restarts/redeploys (otherwise you must re-scan the QR each deploy).
4. The container runs `prisma migrate deploy` on start (creates tables), then boots.
5. Note the generated public URL → this is your API base.

### 3. Web service
1. **New** → same repo → **Root Directory** `web` (uses `web/Dockerfile`).
2. **Build args / Variables** (NEXT_PUBLIC_* are baked at build time):
   - `NEXT_PUBLIC_API_URL` → the backend's public URL (e.g. `https://your-api.up.railway.app`)
   - `NEXT_PUBLIC_WS_URL` → `wss://your-api.up.railway.app/ws`
3. Deploy, then open the web URL on your phone and link WhatsApp.

> The web Dockerfile reads `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` as Docker
> **build args**. On Railway, service variables are available at build time, so
> setting them as variables is sufficient. After changing them, **redeploy** the
> web service so the new values are inlined.

### Single-service alternative
You can deploy only the backend (it's a standalone service) and host the Next.js
app anywhere (Vercel, another Railway service, etc.). Just point the frontend's
`NEXT_PUBLIC_*` vars at the backend URL and add that origin to `CORS_ORIGIN`.

---

## Notes & limitations (MVP)
- Single WhatsApp session (id `default`); the schema already supports multiple.
- Text messages are first-class; media is stored as a typed placeholder (e.g. `📷 Photo`).
- Inbound auto-translate only runs on live messages (not backfilled history) to control cost.
- No app-level auth — put it behind a private network / proxy auth if exposed publicly.
# ai_whatsapp
