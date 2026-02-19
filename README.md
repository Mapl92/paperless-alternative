# DocuMind

A self-hosted document management system with AI-powered OCR, classification, and semantic search. Built as a modern alternative to Paperless-ngx.

## Features

- **AI-Powered Processing**: Automatic OCR, classification, tagging, and summarization via OpenRouter (GPT-4.1-mini, Gemini, Claude, etc.)
- **Semantic Search**: Vector-based search using Google Gemini embeddings + pgvector (hybrid: text + cosine similarity)
- **Document Chat**: Ask questions about your documents with AI (SSE streaming, document pinning)
- **Document Sharing**: Share documents externally via Cloudflare R2 presigned URLs (no VPN needed for recipients)
- **Email Import**: Automatic IMAP polling — imports PDF attachments from unread emails (Gmail, Outlook, GMX, Web.de)
- **Consume Folder**: Drop PDFs into a watched directory for automatic import
- **Digital Signatures**: Create signatures, generate signing tokens, public signing page
- **Reminders**: Set reminders for documents with due dates and notifications
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
# Used for semantic search (embeddings) and document chat
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
| `GEMINI_API_KEY` | No | Google Gemini key for semantic search and chat |
| `DATABASE_URL` | No | PostgreSQL connection string (default works with included DB) |
| `DATA_DIR` | No | Document storage path inside container (default: `/app/data`) |
| `R2_ACCOUNT_ID` | No | Cloudflare account ID (for document sharing) |
| `R2_ACCESS_KEY_ID` | No | R2 API token access key ID |
| `R2_SECRET_ACCESS_KEY` | No | R2 API token secret access key |
| `R2_BUCKET_NAME` | No | R2 bucket name |

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
5. **Enable document sharing**: Set up Cloudflare R2 (see [Document Sharing](#document-sharing-cloudflare-r2) below)

## Document Sharing (Cloudflare R2)

DocuMind can share documents with external recipients via [Cloudflare R2](https://developers.cloudflare.com/r2/) presigned URLs. Recipients get a direct download link that works globally — no VPN or login required. The file is served from Cloudflare's CDN, not from your server.

### How it works

1. Click "Teilen" (Share) on any document
2. Choose an expiry (1 hour, 24 hours, 3 days, or 7 days max)
3. The PDF is uploaded to your R2 bucket and a presigned URL is generated
4. Share the URL — anyone with the link can download the file
5. Expired links and their R2 objects are automatically cleaned up every 4 hours

### Setup

1. **Create a free Cloudflare account** at [cloudflare.com](https://dash.cloudflare.com/sign-up)

2. **Create an R2 bucket**:
   - Go to R2 Object Storage > Create bucket
   - Choose a name (e.g. `documind-shares`)
   - Select a region close to you

3. **Create an R2 API token**:
   - Go to R2 Object Storage > Manage R2 API Tokens > Create API token
   - Permission: **Object Read & Write**
   - Scope: Apply to the bucket you created
   - Copy the **Access Key ID** and **Secret Access Key**

4. **Get your Account ID**:
   - Visible in the R2 dashboard URL: `https://dash.cloudflare.com/<ACCOUNT_ID>/r2/`
   - Or in the bucket details page under "S3 API" endpoint

5. **Add to `.env.production`**:

```env
R2_ACCOUNT_ID="your-cloudflare-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="documind-shares"
```

6. **Restart the container** (must recreate to load new env vars):

```bash
docker compose up -d
```

The "Teilen" button will appear on document detail pages once R2 is configured. If R2 is not configured, the feature is simply hidden — everything else works normally.

### Limits

- Maximum presigned URL validity: **7 days** (Cloudflare R2 limit)
- Free tier: **10 GB storage**, **10 million reads/month**, **no egress fees**
- Expired files are automatically deleted from R2 by a cleanup job (runs every 4 hours)

## Architecture

```
Next.js 16 ─── Prisma 7 ─── PostgreSQL 16 (pgvector)
    │
    ├── OpenRouter API (OCR, classification, chat)
    ├── Google Gemini API (embeddings)
    ├── Cloudflare R2 (document sharing)
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
- **Storage**: Cloudflare R2 (S3-compatible, document sharing via presigned URLs)
- **Search**: pgvector HNSW index, hybrid search (text ILIKE + cosine similarity + Reciprocal Rank Fusion)
- **Auth**: JWT sessions (jose) + bcrypt passwords
- **Deployment**: Docker Compose, optimized for ARM64 (Raspberry Pi 5)

## License

MIT
