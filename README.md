# claude-code-harness

Um jeito de desenvolver com Claude Code em que o agente não decide sozinho quando terminou.
Cada etapa tem uma condição de parada que a máquina verifica: um hook que barra o comando
destrutivo, um portão que reprova o PR, um revisor que não viu o que o implementador viu.

O repositório tem quatro peças, e todas rodam ou são lidas pelo agente:

| Peça | Onde | O que é |
|---|---|---|
| Blueprint | [`blueprint/`](blueprint/) | O método escrito: fases, delegabilidade, portões, orquestração. Cerca de 4.700 linhas, mais o dicionário canônico de nomes. |
| Harness de projeto | [`template-projeto/`](template-projeto/) | Os hooks de limite e os scripts de portão que entram em cada projeto, com o `CLAUDE.md` de partida. |
| Camada de usuário | [`usuario/`](usuario/) | 24 agentes especialistas e 3 skills que valem em qualquer projeto, instalados em `~/.claude/`. |
| Instaladores | [`instalar-harness.mjs`](instalar-harness.mjs), [`instalar-usuario.mjs`](instalar-usuario.mjs) | Levam o harness para um projeto e a camada de usuário para `~/.claude/`, sem sobrescrever nada em silêncio. |

Tudo é Node puro, sem dependência, escrito e testado no Windows 11 com Node 24.

## O método

### 1. Agentes com contrato, não agentes genéricos

São 24 especialistas em [`usuario/agents/`](usuario/agents/): 4 em `opus` para decisão cara
(`orchestrator`, `project-planner`, `database-architect`, `security-auditor`), 19 em `sonnet`
para o volume do trabalho e 1 em `haiku` para busca mecânica (`explorer-agent`). A descrição de
cada um é também a regra de roteamento: quando a tarefa bate com ela, despacha-se aquele
especialista.

Cada agente declara no frontmatter o nível de delegabilidade (D0 a D3, Parte 0.3 do blueprint) e
diz no corpo qual portão fecha o trabalho dele. D0 nunca se delega; D1 é rascunho que um humano
aprova; D2 itera sozinho até o portão passar; D3 roda sem ninguém. Nenhum agente nasce D3.

O contrato embutido nos implementadores:

- tarefa ambígua volta como `NEEDS_CONTEXT`, sem código;
- só toca os arquivos listados no `Files:` do briefing;
- nunca faz `git commit`: quem comita é o orquestrador, um commit por tarefa, com o `HEAD` lido
  imediatamente antes de cada commit;
- não diz "pronto" sem o comando de verificação rodado no mesmo turno;
- termina em `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` ou `BLOCKED`.

Os revisores são somente leitura e todo achado precisa de um cenário de falha concreto. Achado sem
cenário é palpite e é descartado.

A skill [`onda-paralela`](usuario/skills/onda-paralela/SKILL.md) decide quando vale abrir vários
agentes. Multiagente custa de 3 a 10 vezes mais tokens, então só se paga em três casos: proteger
o contexto principal, paralelizar tarefas de fato independentes, ou comprar um revisor que não
sabe o que o implementador sabe. Duas tarefas entram na mesma onda só se nenhuma depende da outra
e os conjuntos de arquivos são totalmente disjuntos. Mesmo arquivo em seções diferentes já
desqualifica, porque dentro da onda nada foi commitado e o último a gravar vence sem conflito
visível.

### 2. Hooks de limite, testados como código

Três hooks em [`template-projeto/.claude/hooks/`](template-projeto/.claude/hooks/), registrados em
`PreToolUse`:

| Hook | Barra |
|---|---|
| `bloqueia-destrutivo` | `git push --force`, `git reset --hard`, `rm -rf`, `drop table`, `truncate`, `prisma migrate reset/dev`, `prisma db push`, `supabase db reset` contra banco remoto. Libera `--force-with-lease`. |
| `protege-segredo` | Escrita em `.env*`, `.envrc`, `*.pem`, `*.p12`, `id_rsa`, `credentials.json`. Libera `.env.example`. |
| `protege-catraca` | Escrita em arquivo de baseline e em `.catraca/`: o teto de dívida técnica só desce. |

Os três são fail-closed. Payload ilegível (`null` literal, stdin vazio, JSON quebrado, array no
lugar de objeto) bloqueia em vez de liberar, porque `JSON.parse("null")` não lança erro e derruba
a guarda escrita às pressas. O helper `payload.mjs` concentra essa leitura.

O portão `hooks:check` ([`scripts/hooks-check.mjs`](template-projeto/scripts/hooks-check.mjs))
roda cada hook nos casos feliz, bloqueado e ilegível e confere o código de saída. Também prova que
cada hook está registrado no `settings.json`, que o caminho registrado existe no disco e que ele
não depende da pasta atual da sessão. Hook sem caso declarado reprova o portão.

Só entram hooks de limite, nunca de processo. Hook que bloqueia o fluxo na primeira semana vira a
coisa que o time desliga, e desligado ele não volta. Os de limite custam pouco no falso positivo:
você roda o comando no seu próprio terminal.

### 3. Portões por perfil de projeto

Nem todo projeto precisa dos mesmos portões. Três perguntas, nesta ordem, classificam o projeto
num de quatro perfis ([`_DICIONARIO-CANONICO.md`](blueprint/_DICIONARIO-CANONICO.md) §4):

1. Alguém faz login? Não: **SITE**.
2. O dado principal é de pessoa que não usa o sistema? Sim: **CRM**.
3. Clientes diferentes precisam ficar invisíveis um para o outro? Sim: **SAAS**. Não: **APP**.

Na dúvida, o perfil mais alto. Subir de perfil é acrescentar portão; descer é decisão humana com
ADR. O perfil fica num arquivo `.perfil` na raiz, e o portão `profile:check` reprova quando o
código mostra sinal de perfil acima do declarado (sessão de usuário, `tenant_id`, tabela de leads).

O comando único é `verify`, com uma corrente por perfil:

| Perfil | `verify` (tier 2, teto de 90 s, sem rede nem banco) |
|---|---|
| SITE | `profile:check` `lint` `build` `size:check` `test:meta` `links:check` `bundle:scan` |
| APP | `profile:check` `lint` `typecheck` `test` `build` `size:check` `test:authz` `test:idor` `bundle:scan` |
| SAAS | APP mais `test:input` `test:logging` |
| CRM | SAAS mais `test:dedupe` |

Em volta dele há três outros tiers: `secrets:scan` no que está em stage (tier 1), `verify:ci` no
CI com `sast`, `hooks:check`, `test:rls` e afins, conforme o perfil (tier 3), e `verify:deploy` contra a URL
publicada, onde mora `headers:check` (tier 4). Perfil menor tem menos portões, nunca portão mais
frouxo. Regra nova de lint nasce em `warn` e só vira `error` quando a contagem chega a zero.

A skill [`verificar-feature`](usuario/skills/verificar-feature/SKILL.md) é o portão de saída do
agente: lê o `.perfil`, roda a corrente na ordem, para no primeiro erro e devolve um relatório com
a saída real de cada portão. Script ausente vira `NAO COBERTO`, nunca verde.

### 4. Revisão em duas passadas

O agente [`revisor`](usuario/agents/revisor.md) lê o diff inteiro antes do PR, em contexto isolado
e somente leitura. Revisão de uma passada só aprova critério sem teste e deixa passar defeito que
nenhum critério nomeou, então são duas:

1. **Cada critério de pronto contra o teste que o cobre.** Para cada critério, o revisor acha o
   teste que falharia se o critério quebrasse e lê o `expect`. Critério sem teste é achado.
2. **Defeitos fora dos critérios**, com o foco nomeado no briefing: segurança, perda de dado,
   concorrência, cálculo de valor. Dentro dela vale uma ordem fixa, que começa por vazamento de
   tenant, IDOR e autorização só no cliente.

O revisor não elogia, não resume e não conserta. A falha que ele acha duas vezes vira caso de
portão (`test:authz`, `test:idor`, `test:input`) e sai da lista dele.

A skill [`intake`](usuario/skills/intake/SKILL.md) faz o trabalho do outro lado: antes da primeira
linha de código, no máximo cinco perguntas por fase, cada uma com o default recomendado. Pendência
em item bloqueante para o trabalho.

## Como usar

Clone o repositório e rode os testes:

```bash
npm test
```

Leve o harness para um projeto. Comece sempre pelo `--dry-run`, que mostra o plano e não escreve
nada:

```bash
node instalar-harness.mjs ../meu-projeto --dry-run
```

O instalador detecta o perfil pelo código e pede confirmação. Arquivo que já existe e difere vira
`<nome>.harness-novo` ao lado, para você juntar à mão. No fim ele imprime o bloco de `scripts`
do perfil para o `package.json` e roda `hooks:check` no destino.

Instale os agentes e as skills em `~/.claude/`, também pelo `--dry-run` primeiro:

```bash
node instalar-usuario.mjs --dry-run
```

Arquivo que já existe em `~/.claude/` com conteúdo diferente fica como está e sai listado como
pendente. Só `--sobrescrever` troca, e sempre com backup ao lado. `--exportar <item>` faz o
caminho inverso, de `~/.claude/` para `usuario/`, e recusa arquivo com cara de segredo.

## Testes

`npm test` roda as duas suítes:

- `hooks:check`: 66 casos sobre os três hooks e o registro deles no `settings.json`.
- `instalar-usuario.test.mjs`: 166 verificações do instalador da camada de usuário, num home falso
  e numa raiz falsa. Nunca toca o `~/.claude/` de verdade: antes do primeiro caso, uma sonda
  confere que o processo filho enxerga o home falso, e para se não enxergar. Os segredos falsos
  são gerados em tempo de execução.

Cada teste traz no comentário a sabotagem que ele pega: a mudança no código que faz o caso
reprovar. Guarda que nunca reprovou nada é guarda vazia.

## Estrutura

```
blueprint/
  blueprint-sdlc-agent-ready.md   o método, Partes 0 a 16
  _DICIONARIO-CANONICO.md         nomes de portão, tiers, verify por perfil
  perfis/                         site, app, saas, crm
template-projeto/
  .claude/hooks/                  os três hooks de limite e o payload.mjs
  .claude/settings.json           o registro dos hooks
  scripts/                        profile-check, tree-check, hooks-check, headers-check
  CLAUDE.md, LEIA-ME.md, .perfil, package.scripts.json
usuario/
  agents/                         24 especialistas
  skills/                         intake, onda-paralela, verificar-feature
instalar-harness.mjs
instalar-usuario.mjs
instalar-usuario.test.mjs
```

## Créditos e licença

A base deste trabalho é o [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit)
de Matheus Gomes, sob licença MIT. Dele vêm o elenco inicial de agentes, a regra de execução em
ondas paralelas (`Files:` e `Depends-on:`) e o helper de leitura segura de evento de hook. O
blueprint, os perfis, os portões, os hooks de limite e seus testes, os instaladores, o agente
`revisor` e as skills são de Arthur Coupê.

Licença MIT, com os dois avisos de copyright em [`LICENSE`](LICENSE).

---

## In English

A Claude Code harness where the agent never decides on its own that it is done. Every step has a
machine-checked stop condition.

- **24 specialist agents** with a delegation level (D0 to D3) and a gate that closes each one's
  work. Implementers never commit; the orchestrator does, one commit per task. Parallel waves only
  when tasks have no dependency and fully disjoint file sets.
- **Three boundary hooks** (destructive commands, secret files, debt baselines), fail-closed on
  unreadable payloads and covered by 66 test cases, including proof that each hook is actually
  registered.
- **Gates per project profile** (SITE, APP, SAAS, CRM), picked by three questions, with one
  `verify` chain per profile across four tiers.
- **Two-pass review**: first every acceptance criterion against the test that covers it, then
  defects outside the criteria with a named focus (security, data loss, concurrency, money).

Plain Node, no dependencies, tested on Windows 11 with Node 24. Docs are in Portuguese. Run
`npm test`. Built on Matheus Gomes's MIT-licensed vibe-coding-toolkit.
