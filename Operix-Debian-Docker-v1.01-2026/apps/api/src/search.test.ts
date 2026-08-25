import test from 'node:test';
import assert from 'node:assert/strict';
import { searchableTypesForRole, searchQuerySchema } from './search.js';

test('busca valida consulta, limite e tipos', () => {
  const parsed = searchQuerySchema.parse({ q: '  impressora quebrada  ', limit: '10', types: 'ticket,asset' });
  assert.equal(parsed.q, 'impressora quebrada');
  assert.equal(parsed.limit, 10);
  assert.deepEqual(parsed.types, ['ticket', 'asset']);
});

test('solicitante pesquisa somente seus chamados e ordens', () => {
  assert.deepEqual(searchableTypesForRole('REQUESTER'), ['ticket', 'work_order']);
});

test('tecnico nao recebe dados pessoais na pesquisa global', () => {
  assert.deepEqual(searchableTypesForRole('TECHNICIAN'), ['ticket', 'work_order', 'asset', 'item']);
});

test('administrador pode pesquisar todos os tipos', () => {
  assert.deepEqual(searchableTypesForRole('ADMIN'), ['ticket', 'work_order', 'asset', 'item', 'person']);
});
