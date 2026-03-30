/**
 * build-index.ts
 *
 * Builds a semantic search index from LLNG RST documentation sources.
 *
 * Usage:
 *   tsx scripts/build-index.ts --src /path/to/lemonldap-ng/doc/sources
 *
 * Output:
 *   data/index.json  (chunks + embeddings)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { resolve, join, extname, dirname } from "path";
import { Ollama } from "ollama";

const EMBEDDING_MODEL = "nomic-embed-text";
const CHUNK_SIZE = 300;       // words per chunk
const CHUNK_OVERLAP = 50;     // words overlap between chunks
const MAX_CHARS = 6000;       // max characters sent to embedding model

interface Chunk {
  id: string;
  file: string;
  section: string;
  text: string;
  embedding: number[];
}

// ── RST helpers ───────────────────────────────────────────────────────────────

function parseRst(content: string): Array<{ title: string; text: string }> {
  const sections: Array<{ title: string; text: string }> = [];
  const lines = content.split("\n");

  let currentTitle = "Introduction";
  let currentLines: string[] = [];

  const HEADING_CHARS = "=-~^\"'`#*+<>";
  const isUnderline = (line: string) =>
    line.length > 0 && HEADING_CHARS.includes(line[0]) && /^(.)\1+$/.test(line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";

    if (next && isUnderline(next) && next.length >= line.length) {
      // This line is a section title
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, text: currentLines.join("\n").trim() });
      }
      currentTitle = line.trim();
      currentLines = [];
      i++; // skip underline
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, text: currentLines.join("\n").trim() });
  }

  return sections.filter((s) => s.text.length > 50);
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += size - overlap) {
    chunks.push(words.slice(i, i + size).join(" "));
    if (i + size >= words.length) break;
  }

  return chunks;
}

// ── File walker ───────────────────────────────────────────────────────────────

function walkRst(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkRst(full));
    } else if (extname(entry) === ".rst" || extname(entry) === ".txt") {
      results.push(full);
    }
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf("--src");

  if (srcIdx === -1 || !args[srcIdx + 1]) {
    console.error("Usage: tsx scripts/build-index.ts --src /path/to/llng/doc/sources");
    process.exit(1);
  }

  const srcDir = resolve(args[srcIdx + 1]);
  const outFile = resolve("data/index.json");

  // Ensure output directory exists
  mkdirSync(dirname(outFile), { recursive: true });

  console.log(`Source : ${srcDir}`);
  console.log(`Output : ${outFile}`);
  console.log("");

  const ollama = new Ollama({
    host: process.env.OLLAMA_URL ?? "http://localhost:11434",
  });

  // Ensure embedding model is available
  console.log(`Pulling embedding model ${EMBEDDING_MODEL}...`);
  await ollama.pull({ model: EMBEDDING_MODEL });

  const rstFiles = walkRst(srcDir);
  console.log(`Found ${rstFiles.length} RST files\n`);

  const allChunks: Chunk[] = [];
  let fileCount = 0;

  for (const file of rstFiles) {
    fileCount++;
    const relPath = file.replace(srcDir, "").replace(/^\//, "");
    process.stdout.write(`[${fileCount}/${rstFiles.length}] ${relPath}\r`);

    const content = readFileSync(file, "utf-8");
    const sections = parseRst(content);

    for (const section of sections) {
      const textChunks = chunkText(section.text, CHUNK_SIZE, CHUNK_OVERLAP);

      for (let i = 0; i < textChunks.length; i++) {
        const text = `${section.title}\n\n${textChunks[i]}`.slice(0, MAX_CHARS);

        try {
          const response = await ollama.embeddings({
            model: EMBEDDING_MODEL,
            prompt: text,
          });

          allChunks.push({
            id: `${relPath}#${section.title}#${i}`,
            file: relPath,
            section: section.title,
            text,
            embedding: response.embedding,
          });
        } catch (err) {
          console.warn(`\n  Warning: Skipped chunk ${relPath}#${section.title}#${i}: ${(err as Error).message}`);
        }
      }
    }
  }

  console.log(`\n\nGenerated ${allChunks.length} chunks`);
  writeFileSync(outFile, JSON.stringify(allChunks));
  console.log(`Index written to ${outFile}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
