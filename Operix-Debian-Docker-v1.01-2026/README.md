# Operix v1.01-2026

Plataforma operacional multiempresa para Grafmarques, INFINNI e M.Print. Reúne chamados do solicitante, aprovação setorial, ordens de serviço, manutenção, TI, gestão de frota, avaliações obrigatórias, Segurança do Trabalho, almoxarifado, inventário de EPIs, cadastros, relatórios e controle de acesso.

## Fluxo operacional da versão

- A aba Chamados mostra somente as solicitações do usuário autenticado e seu andamento.
- Chamados de Manutenção e TI são aprovados ou negados dentro da gestão responsável, com data, hora e justificativa da negativa.
- Toda ordem lista solicitante, data do chamado, aprovação, encerramento e avaliação.
- Uma ordem tecnicamente concluída aguarda avaliação obrigatória e justificativa do solicitante. Enquanto houver avaliação pendente, a API e a interface bloqueiam um novo chamado.
- Checklists usam respostas Sim, Não ou Não se aplica. Toda resposta Não exige justificativa.
- Entregas do almoxarifado registram resposta, quantidade, responsável, data, comprovante e assinaturas do responsável e do recebedor.

## Tecnologias

- React, TypeScript e Vite no frontend.
- Node.js, Express e TypeScript na API.
- PostgreSQL 16.
- Nginx e Docker Compose em produção.

## Desenvolvimento e teste no Windows

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm dev
```

Para testar somente a build pronta, execute `Iniciar-Operix.ps1` e acesse `http://localhost:4173`.

## Ambiente completo com Docker

```bash
cp .env.example .env
# Edite senhas e APP_ORIGIN.
docker compose config
docker compose up --build -d
docker compose ps
```

A aplicação ficará em `WEB_PORT`, normalmente `http://localhost:8080`. A porta do PostgreSQL não é publicada.

## Gerar os pacotes de entrega

Depois de `pnpm build`, execute no Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\Gerar-Pacotes.ps1
```

Arquivos gerados em `release/`:

- `Operix-Teste-Windows11-v1.01-2026.zip`: demonstração local simples no Windows 11.
- `Operix-Windows-Server-v1.01-2026.zip`: implantação completa em Windows Server com Docker/Compose compatível.
- `Operix-Debian-Docker-v1.01-2026.zip`: implantação completa no Debian com Docker Engine e Compose v2.

## Documentação

- [Windows Server](docs/WINDOWS_SERVER.md)
- [Debian com Docker](docs/DOCKER_DEBIAN.md)
- [GitHub](docs/GITHUB.md)
- [Arquitetura](docs/ARQUITETURA.md)
- [Estado técnico](docs/STATUS_ATUAL.md)

## Segurança antes da produção

Troque credenciais iniciais, use HTTPS, restrinja o firewall, configure backup externo e teste a restauração. Não versione `.env`, backups ou anexos reais. A demonstração local usa dados do navegador; a implantação definitiva deve usar API/PostgreSQL e armazenamento protegido para anexos.

## Verificação de qualidade

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
docker compose config
```

Registre cada versão em um Pull Request e uma release do GitHub.

## API de pesquisa

A rota autenticada `GET /api/search` pesquisa dados da empresa selecionada e respeita o perfil do usuário.

Parâmetros:

- `q`: texto da pesquisa, entre 2 e 120 caracteres.
- `limit`: quantidade de resultados, entre 1 e 50; o padrão é 20.
- `types`: tipos separados por vírgula. Valores disponíveis: `ticket`, `work_order`, `asset`, `item` e `person`.

Exemplo:

```http
GET /api/search?q=impressora%20quebrada&types=ticket,asset&limit=10
Authorization: Bearer <token>
X-Tenant-Id: <empresa-id>
```

Solicitantes encontram somente os próprios chamados e ordens. Perfis técnicos também pesquisam ativos e itens; dados de pessoas ficam restritos à administração.

Quando `GEMINI_API_KEY` está configurada no ambiente da API, os resultados também são reordenados semanticamente com `gemini-embedding-001`. A pesquisa local continua disponível automaticamente caso o serviço externo esteja indisponível.
