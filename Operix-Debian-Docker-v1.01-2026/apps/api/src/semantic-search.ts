import { createHash } from 'node:crypto';
import type { SearchResult } from './search.js';

const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const dimensions = 768;
const documentCache = new Map<string, number[]>();

type EmbeddingResponse = { embeddings: { values: number[] }[] };

function apiKey() {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

export function semanticSearchEnabled() {
  return apiKey().length > 20;
}

function documentText(result: SearchResult) {
  return [result.type, result.title, result.description, result.status, result.reference]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 3000);
}

function cacheKey(text: string) {
  return createHash('sha256').update(`${model}:${dimensions}:${text}`).digest('hex');
}

async function createEmbeddings(input: string[]) {
  const modelPath = `models/${model}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:batchEmbedContents`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: input.map((text, index) => ({
        model: modelPath,
        content: { parts: [{ text }] },
        taskType: index === 0 ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
        outputDimensionality: dimensions,
      })),
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Gemini embeddings indisponível (${response.status})`);
  const payload = await response.json() as EmbeddingResponse;
  return payload.embeddings.map(item => item.values);
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

export async function semanticRerank(query: string, candidates: SearchResult[], limit: number) {
  if (!semanticSearchEnabled() || !candidates.length) return candidates.slice(0, limit);
  const texts = candidates.map(documentText);
  const missingTexts = [...new Set(texts.filter(text => !documentCache.has(cacheKey(text))))];
  const [queryEmbedding, ...missingEmbeddings] = await createEmbeddings([query, ...missingTexts]);

  missingTexts.forEach((text, index) => documentCache.set(cacheKey(text), missingEmbeddings[index]));

  return candidates
    .map((result, index) => {
      const semanticScore = cosineSimilarity(queryEmbedding, documentCache.get(cacheKey(texts[index])) || []);
      const lexicalScore = Math.min(1, Math.max(0, Number(result.score) || 0));
      return {
        ...result,
        score: Number((semanticScore * 0.72 + lexicalScore * 0.28).toFixed(6)),
        semanticScore: Number(semanticScore.toFixed(6)),
      };
    })
    .filter(result => result.semanticScore >= 0.2 || result.score >= 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
