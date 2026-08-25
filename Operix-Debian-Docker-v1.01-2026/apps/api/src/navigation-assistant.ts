const model = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite';

export const navigationScreens = {
  dashboard: 'Visão geral e indicadores',
  tickets: 'Chamados e abertura de solicitações',
  orders: 'Ordens de serviço',
  maintenance: 'Gestão de manutenção, equipamentos, cronogramas e checklists',
  it: 'Gestão de TI',
  fleet: 'Gestão de frota e veículos',
  reviews: 'Avaliações dos serviços',
  safety: 'Segurança do trabalho e solicitações de EPI',
  hr: 'Recursos humanos e colaboradores',
  warehouse: 'Almoxarifado, estoque e materiais',
  training: 'Treinamentos e informativos',
  admin: 'Administração, usuários, empresas, setores e configurações',
} as const;

export type NavigationScreen = keyof typeof navigationScreens;
export type NavigationAnswer = { answer: string; screen: NavigationScreen | null; label: string | null };

function apiKey() {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

export function localNavigationAnswer(message: string, allowed: NavigationScreen[]): NavigationAnswer {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rules: [NavigationScreen, string[]][] = [
    ['tickets', ['chamado', 'solicitacao', 'problema', 'abrir pedido']],
    ['orders', ['ordem de servico', 'os ', 'servico em andamento']],
    ['warehouse', ['almoxarifado', 'estoque', 'material', 'peca']],
    ['maintenance', ['manutencao', 'equipamento', 'preventiva', 'checklist']],
    ['fleet', ['frota', 'veiculo', 'carro', 'caminhao']],
    ['safety', ['epi', 'seguranca do trabalho', 'acidente']],
    ['training', ['treinamento', 'informativo', 'curso']],
    ['hr', ['rh', 'recursos humanos', 'colaborador', 'funcionario']],
    ['it', ['ti', 'computador', 'sistema', 'internet']],
    ['reviews', ['avaliacao', 'avaliar servico']],
    ['admin', ['usuario', 'empresa', 'setor', 'permissao', 'configuracao']],
    ['dashboard', ['painel', 'indicador', 'visao geral', 'inicio']],
  ];
  const screen = rules.find(([candidate, terms]) => allowed.includes(candidate) && terms.some(term => normalized.includes(term)))?.[0] || null;
  if (!screen) return { answer: 'Não encontrei uma tela específica. Tente explicar a tarefa com um pouco mais de detalhe.', screen: null, label: null };
  return { answer: `Você encontra isso em ${navigationScreens[screen]}.`, screen, label: `Abrir ${navigationScreens[screen]}` };
}

export async function askNavigationAssistant(message: string, allowed: NavigationScreen[]): Promise<NavigationAnswer> {
  if (apiKey().length < 20) return localNavigationAnswer(message, allowed);
  const routes = allowed.map(screen => `${screen}: ${navigationScreens[screen]}`).join('\n');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Você é o guia do sistema Operix. O usuário quer saber onde realizar uma tarefa. Responda em português, em no máximo duas frases. Escolha somente uma das telas permitidas abaixo; se nenhuma servir, use screen null. Nunca invente links, telas ou ações.\n\nTelas permitidas:\n${routes}\n\nPedido do usuário: ${message}` }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            answer: { type: 'STRING' },
            screen: { type: 'STRING', nullable: true, enum: allowed },
            label: { type: 'STRING', nullable: true },
          },
          required: ['answer', 'screen', 'label'],
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Assistente Gemini indisponível (${response.status})`);
  const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('O Gemini não retornou uma orientação.');
  const parsed = JSON.parse(text) as NavigationAnswer;
  if (parsed.screen && !allowed.includes(parsed.screen)) parsed.screen = null;
  if (!parsed.screen) parsed.label = null;
  return parsed;
}
