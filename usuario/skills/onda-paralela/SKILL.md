---
name: onda-paralela
description: Despacho de subagentes em ondas paralelas. Use antes de abrir mais de um implementador ao mesmo tempo, quando pensar "vou abrir 3 agentes para ir mais rápido", ou ao planejar tarefas que talvez rodem juntas. Decide primeiro se multiagente paga e quem executa (subagente nativo ou orquestrador externo), forma as ondas pelas duas condições (Files disjuntos e sem Depends-on) e fixa quem comita.
---

# onda-paralela

## 1. Comece pelo custo

Três agentes não custam três vezes um agente — custam mais: cada um reconstrói do zero o contexto
que o vizinho já tem. Em campo o múltiplo é **3× a 10×**; meça o seu com `/usage` antes e depois
de uma feature típica. **Onda só paga em três cenários:**

| Cenário | O que caracteriza | Teste antes de abrir o segundo processo |
|---|---|---|
| Proteção de contexto | Gera lixo que você não quer no contexto principal: varrer 200 arquivos, triar SAST, ler log grande | A saída útil cabe em ~30 linhas? |
| Paralelização real | N tarefas com `Files:` totalmente disjuntos, sem dependência, e o tempo de parede importa | Nomeio as duas tarefas e os arquivos de cada uma em 60 s? |
| Especialização genuína | O outro processo tem checklist, permissão ou ferramenta **diferente** — o revisor vale por não saber o que o implementador sabe | O valor vem de ele não ter o seu contexto? |

**Fora deles: um agente só.** Na dúvida, um agente. Onda de 4 tarefas entra no orçamento como
4 orçamentos, não 1 — se estoura, o corte é reduzir a onda, nunca afrouxar o teto.

**Triagem de custo, antes de qualquer despacho.** Não orquestre quando:
- a tarefa cabe num contexto só (até ~3 arquivos, uma camada);
- é correção de uma linha, typo ou ajuste de texto;
- é só arquitetura ou decisão (D0: não há o que paralelizar);
- as tarefas dependem umas das outras em cadeia.

Nesses casos, sessão única; subagente só para comprar revisão independente (agente `revisor`)
em código de risco: dado, segurança, concorrência. Referência do piloto de 2026-09-28: o mesmo
módulo pequeno custou US$ 0,31 solo e US$ 1,72 orquestrado (~5,5×); no piloto inteiro
(US$ 11,67), a coordenação levou 41%; e o defeito de concorrência veio da spec, não do arranjo. O ganho medido veio da revisão
em duas passadas com contexto separado, não do paralelismo. Revisor em código sensível (auth,
RLS, pagamento, webhook, dado de saúde) vai com `model: opus`; no resto, o padrão.

## 2. Quem executa a onda

Esta skill decide, antes do despacho. **Subagente nativo (ferramenta Agent) é o padrão.**
Orquestrador externo (outro processo coordenando agentes) só quando pelo menos um vale:
- a tarefa vai para agente **não-Claude** (outro CLI ou outro provedor);
- o papel precisa **persistir entre tarefas** (o mesmo Engenheiro ou Revisor recebendo a próxima).

Fora disso, orquestrador externo não entra, e nunca em tarefa pequena. Com ele: um worktree por
Engenheiro, só o orquestrador comita, a pasta de estado dele no `.gitignore` do repo, e mensagem
de agente nunca vale como aprovação humana.

## 3. Marque cada tarefa

Plano versionado em `docs/ondas/<id>.md`, cinco campos, nenhum opcional; nome de portão sempre do
dicionário `blueprint/_DICIONARIO-CANONICO.md` do harness, §2. Toda referência § e os níveis D0 a D2
desta skill são desse arquivo.

```markdown
## T2 — repository e service de contatos
Files:
  apps/api/src/modules/contacts/contacts.repository.ts
  apps/api/src/modules/contacts/contacts.service.ts
Depends-on: T1
Portão: typecheck, test
Nível: D2
Modelo: padrão
```

`Files:` são **caminhos exatos, nunca globs** — dois `apps/api/src/modules/**` parecem disjuntos e
não são. **Incerteza vira dependência:** sem saber se T4 depende de T2, escreva `Depends-on: tudo
que já foi listado`. Conservador custa uma onda a mais; permissivo custa duas meias-features
sobrepostas, sem conflito visível no `git`.

## 4. As duas condições da mesma onda

> Duas tarefas entram na mesma onda **se e somente se** nenhuma depende da outra — nem
> transitivamente — **E** os conjuntos de `Files:` são totalmente disjuntos.

Ambas, sempre. **"Mesmo arquivo" desqualifica mesmo em seções diferentes:** cada agente lê o
arquivo, monta a versão nova a partir do que leu e grava; o segundo leu antes de o primeiro
escrever, e o resultado é a versão dele inteira, sem marcador de conflito — o `git` só protege
entre commits, e dentro da onda nada foi commitado. A formação da onda não tem portão: **D0**.

## 5. O loop

1. **Plano** conferido nas duas condições.
2. **Árvore limpa:** script `tree:check` (§2.7), rodado com o gerenciador que o lockfile do repo
   indica (`bun.lock` → `bun run`, `package-lock.json` → `npm run`, `pnpm-lock.yaml` → `pnpm run`)
   — nunca `git diff --quiet && ...`: `&&` é erro de parse no PowerShell 5.1, e
   `git status --porcelain` sozinho sai 0 com ou sem saída.
3. **Briefing por tarefa**, cinco blocos: contexto mínimo com caminho exato do que ler; lista fechada
   do que pode escrever; o portão, para rodar até passar; o proibido (`git`, editar fora da lista,
   instalar dependência, rodar migration); o relatório — arquivos, saída literal, `SUPOSICAO:`.
4. **Despacho numa mensagem só.** Separadas, o tempo vira serial e o custo já foi pago. Na **espera**,
   não leia arquivo nem edite: ler é o retrato de um arquivo em escrita, e "corrigir" o que viu meio
   pronto introduz um terceiro escritor.
5. **Commits, do orquestrador**, um por tarefa, por lista explícita de caminhos — nunca `-A`, nunca
   `.` — com `git rev-parse HEAD` lido **imediatamente antes de cada commit**. `HEAD` capturado uma
   vez por onda vira o avô de T3: o diff mostra T2 junto e o revert de T3 desfaz T2.
6. **Revisores juntos, depois dos commits** — não escrevem arquivo, não declaram fronteira. E um
   **registro por onda** em `docs/ondas/<id>-registro.md` com o par `antes→depois` por tarefa.
7. **Fechamento:** o script `verify`, pelo gerenciador do repo, uma vez; sem `verify`, a corrente do
   perfil pela skill `verificar-feature`. No meio da onda o orquestrador não roda portão de tarefa
   — a árvore tem trabalho parcial das outras e ele reprova por motivo alheio.
8. **Arquivo de registro — rotas, barril, i18n, lockfile (`bun.lock`, `package-lock.json`) — é do orquestrador, depois de a
   onda fechar.** Dois agentes instalando dependência quebram o lockfile toda vez.

## 6. Nenhum implementador comita

> Quem escreve arquivo nunca escreve no índice do `git`. A exceção "só dessa vez" é pedida quando três
> agentes estão no ar — o único estado em que sobrescrita silenciosa e disputa de `index.lock` estão vivas juntas.

**Isto não vira hook.** Dicionário §5.1: hook de comando não distingue quem chamou — o mesmo `git
commit` é proibido para o implementador e obrigatório para o orquestrador. O mecanismo estrutural é
**permissão de ferramenta do subagente**: implementador sem acesso a shell não roda `git`. Sem essa
permissão no harness, é **convenção declarada D0**, no briefing e no `CLAUDE.md` — nunca uma trava.

## 7. Modelo por despacho, nunca herdado

`Modelo:` é obrigatório porque o default de todo harness é herdar do pai. Mecânico (renomear, codemod, traduzir AC em
`it()`) → barato; implementação, debug e revisão → padrão; arquitetura de verdade → caro, e é D0/D1: **não vai para onda.** Sem `Modelo:`, a tarefa não sai.

**Degradação:** sem `docs/ondas/`, crie o caminho. Sem `tree:check`, o script está em
`template-projeto/scripts/tree-check.mjs` do harness — diga isso, confira com `git status --porcelain` e declare a checagem manual.
