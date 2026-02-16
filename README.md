# DocuMind

A self-hosted document management system with AI-powered OCR, classification, and semantic search. Built as a modern alternative to Paperless-ngx.

## Features

- **AI-Powered Processing**: Automatic OCR, classification, tagging, and summarization via OpenRouter (GPT-4.1-mini, Gemini, Claude, etc.)
- **Semantic Search**: Vector-based search using Google Gemini embeddings + pgvector (hybrid: text + cosine similarity)
- **Document Chat**: Ask questions about your documents with AI (SSE streaming, document pinning)
- **Email Import**: Automatic IMAP polling — imports PDF attachments from unread emails (Gmail, Outlook, GMX, Web.de)
- **Consume Folder**: Drop PDFs into a watched directory for automatic import
- **Digital Signatures**: Create signatures, generate signing tokens, public signing page
- **Responsive UI**: Built with Next.js, Tailwind CSS, and shadcn/ui

## Quick Start (Docker Compose)

### 1. Clone and configure

```bash
git clone https://github.com/Mapl92/paperless-alternative.git
cd paperless-alternative
cp .env.example .env.production
```

### 2. Set your API keys in `.env.production`

```env
# REQUIRED: Generate a random secret (e.g. openssl rand -hex 32)
AUTH_SECRET="your-random-secret-here"

# REQUIRED: OpenRouter API key (https://openrouter.ai/keys)
# Used for OCR, document classification, and chat
OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# OPTIONAL: Gemini API key (https://aistudio.google.com/apikey)
# Enables semantic/hybrid search. Without it, only text search is available.
GEMINI_API_KEY="your-gemini-api-key-here"

# Login password (default: "admin" — change after first login in Settings)
AUTH_PASSWORD="admin"
```

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | Yes | Random string for JWT signing. Generate with `openssl rand -hex 32` |
| `AUTH_PASSWORD` | Yes | Initial login password (changeable in UI) |
| `OPENROUTER_API_KEY` | Yes | API key from [openrouter.ai](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | No | AI model (default: `openai/gpt-4.1-mini`) |
| `GEMINI_API_KEY` | No | Google Gemini key for semantic search embeddings |
| `DATABASE_URL` | No | PostgreSQL connection string (default works with included DB) |
| `DATA_DIR` | No | Document storage path inside container (default: `/app/data`) |

### 3. Start

```bash
docker compose up -d --build
```

The app will be available at **http://localhost:3000**. Login with the password from `AUTH_PASSWORD`.

### 4. First steps

1. **Upload documents**: Drag & drop PDFs on the Upload page — AI processes them automatically
2. **Enable semantic search**: Add a `GEMINI_API_KEY`, then go to Settings and trigger embedding backfill
3. **Set up email import**: Go to Settings > E-Mail, configure your IMAP credentials
4. **Use the consume folder**: Mount a host directory to `/app/data/consume` — any PDF dropped there gets auto-imported

## Architecture

```
Next.js 16 ─── Prisma 7 ─── PostgreSQL 16 (pgvector)
    │
    ├── OpenRouter API (OCR, classification, chat)
    ├── Google Gemini API (embeddings)
    ├── pdftoppm + sharp (PDF → image conversion)
    └── imapflow (email import)
```

### Docker Compose Services

| Service | Image | Purpose |
|---|---|---|
| `documind` | Custom (Node 20 Alpine) | Next.js app server |
| `db` | `pgvector/pgvector:pg16` | PostgreSQL with vector extension |

### Data Storage

All documents are stored in `/app/data` inside the container:
- `originals/` — Original uploaded files (SHA256-named)
- `archive/` — Processed PDFs (named by document ID)
- `thumbnails/` — WebP thumbnails
- `consume/` — Watch folder for auto-import
- `signatures/` — Digital signature images

By default, a Docker named volume (`documind-data`) is used. To use a host directory instead:

```yaml
# docker-compose.yml
volumes:
  - /path/on/host:/app/data
```

Make sure the host directory is writable by UID 1001: `chown -R 1001:1001 /path/on/host`

## Development

```bash
npm install
cp .env.example .env

# Start PostgreSQL (or use docker compose up db)
# Update DATABASE_URL in .env to point to localhost:5432

npx prisma migrate dev
npm run dev
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Lucide icons
- **Backend**: Next.js API routes, Prisma 7, PostgreSQL 16
- **AI**: OpenRouter (multi-model), Google Gemini embeddings
- **Search**: pgvector HNSW index, hybrid search (text ILIKE + cosine similarity + Reciprocal Rank Fusion)
- **Auth**: JWT sessions (jose) + bcrypt passwords
- **Deployment**: Docker Compose, optimized for ARM64 (Raspberry Pi 5)

## License

MIT
