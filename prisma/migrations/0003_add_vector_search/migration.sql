-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (Gemini gemini-embedding-001 reduced to 768 dimensions)
ALTER TABLE "Document" ADD COLUMN "embedding" vector(768);

-- Create HNSW index for cosine similarity search
CREATE INDEX "Document_embedding_idx" ON "Document"
USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
