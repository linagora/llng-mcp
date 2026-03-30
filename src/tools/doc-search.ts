import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Ollama } from "ollama";

const EMBEDDING_MODEL = "nomic-embed-text";

interface Chunk {
  id: string;
  file: string;
  section: string;
  text: string;
  embedding: number[];
}

let cachedIndex: Chunk[] | null = null;

function loadIndex(): Chunk[] {
  if (cachedIndex) return cachedIndex;

  // Look for index.json in several locations
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "../../data/index.json"),
    join(process.env.HOME ?? "~", ".config/llng-mcp/index.json"),
  ];

  if (process.env.LLNG_DOC_INDEX) {
    candidates.unshift(process.env.LLNG_DOC_INDEX);
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      cachedIndex = JSON.parse(readFileSync(path, "utf-8"));
      return cachedIndex!;
    }
  }

  throw new Error(
    "Documentation index not found. Build it with: npm run build-index -- --src /path/to/llng/doc/sources/admin",
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function registerDocSearchTools(server: McpServer): void {
  server.tool(
    "llng_doc_search",
    "Search LemonLDAP::NG documentation using semantic search. Use this to find information about configuration, features, protocols, and troubleshooting.",
    {
      query: z.string().describe("The search query in natural language"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Number of results to return (default: 5)"),
    },
    async ({ query, limit }) => {
      const index = loadIndex();

      const ollama = new Ollama({
        host: process.env.OLLAMA_URL ?? "http://localhost:11434",
      });

      const response = await ollama.embeddings({
        model: EMBEDDING_MODEL,
        prompt: query,
      });

      const queryEmbedding = response.embedding;

      const scored = index.map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }));

      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, limit ?? 5);

      const text = topResults
        .map(
          (r, i) =>
            `--- Result ${i + 1} (score: ${r.score.toFixed(3)}) ---\nFile: ${r.file}\nSection: ${r.section}\n\n${r.text}`,
        )
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );
}
