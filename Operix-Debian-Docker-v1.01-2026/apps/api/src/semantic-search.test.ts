import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity } from './semantic-search.js';

test('similaridade cosseno identifica vetores equivalentes', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('similaridade cosseno rejeita vetores incompatíveis', () => {
  assert.equal(cosineSimilarity([1, 2], [1]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});
