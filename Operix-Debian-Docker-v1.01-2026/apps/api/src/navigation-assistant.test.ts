import test from 'node:test';
import assert from 'node:assert/strict';
import { localNavigationAnswer } from './navigation-assistant.js';

test('assistente local encontra o almoxarifado', () => {
  assert.equal(localNavigationAnswer('onde vejo o estoque de peças?', ['warehouse']).screen, 'warehouse');
});

test('assistente não recomenda tela sem permissão', () => {
  assert.equal(localNavigationAnswer('quero cadastrar um usuário', ['tickets']).screen, null);
});
