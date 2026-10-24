# [NOME DO PROJETO]

> Memoria de projeto, carregada em toda sessao. Curta de proposito: CLAUDE.md longo e
> CLAUDE.md que ninguem le ate o fim. Preencha todo `[PREENCHER]` e apague o resto.

## Perfil

Declarado em `.perfil` na raiz — uma linha, sem comentario: `SITE` | `APP` | `SAAS` | `CRM`.
O perfil decide quais portoes sao obrigatorios aqui (dicionario secao 2); `profile:check`
reprova quando o codigo mostra sinal de perfil **superior** ao declarado. Subir de perfil e
consequencia; descer e decisao D0, com ADR.

## Stack

[PREENCHER: linguagem, framework, gerenciador de pacotes, banco, deploy — ex.: "TypeScript ·
React + Vite · Express · pnpm · Postgres via Supabase · Vercel"]

## Comandos canonicos

**`pnpm verify` e o comando unico.** Tier 2, teto 90 s: sem navegador, sem banco, sem rede.
O nome do portao e a interface, o comando e a implementacao — trocar de stack e editar
`package.json`, nunca esta lista nem os hooks.

| Portao | Comando | Quando |
|---|---|---|
| **`verify`** | **`pnpm verify`** | **antes de todo commit e de todo push** |
| `profile:check` | `node scripts/profile-check.mjs` | primeiro item de `verify` |
| `lint` · `typecheck` · `test` · `build` | `[PREENCHER]` | dentro de `verify` |
| `size:check` · `bundle:scan` | `[PREENCHER]` | dentro de `verify`, depois do `build` |
| `tree:check` | `node scripts/tree-check.mjs` | antes de commitar |
| `secrets:scan` | `[PREENCHER]` | tier 1, so no que esta em stage |
| `verify:ci` | `pnpm verify:ci` | no CI — tier 3, teto 10 min |
| `hooks:check` | `node scripts/hooks-check.mjs` | dentro de `verify:ci` |
| `verify:deploy` | `pnpm verify:deploy` | depois que existe URL de preview |
| `headers:check` | `node scripts/headers-check.mjs <URL>` | tier 4, so contra URL publicada |

A lista fechada de portoes, com um bloco por perfil, esta em `package.scripts.json`.
`headers:check` **nunca** entra em `verify`: cabecalho so existe depois do deploy, e portao
que nasce vermelho e portao que se aprende a pular.

Instalar: `[PREENCHER]` · Dev: `[PREENCHER]`

## Diretrizes de comportamento

1. **Pensar antes de codar** — declare suposicoes. Havendo mais de uma interpretacao,
   apresente as duas em vez de escolher calado. Diga quando existir caminho mais simples.
   Ambiguidade genuina: pare e pergunte.
2. **Simplicidade primeiro** — o minimo de codigo que resolve. Sem feature especulativa, sem
   abstracao de uso unico, sem configurabilidade nao pedida, sem tratamento de erro para
   cenario impossivel.
3. **Mudanca cirurgica** — toque so no que o pedido exige. Siga o estilo existente. Nao
   refatore, nao reformate, nao "melhore" codigo vizinho fora do pedido.
4. **Execucao orientada a objetivo** — transforme tarefa em objetivo verificavel ("corrigir o
   bug" vira "escrever o teste que reproduz, depois fazer passar"). Trabalho multi-etapa:
   plano curto com uma verificacao por passo, repetido ate cada passo estar verificado.
5. **Orquestrador, nao implementador** — a sessao principal planeja, decide e coordena; nao
   implementa. Implementacao e analise delegavel vao para subagente especialista, despachados
   em paralelo quando os escopos nao conflitam.

## Elenco de especialistas

Os 24 especialistas estao instalados em **escopo de usuario**, em `~/.claude/agents/`, e
valem automaticamente aqui — nao ha copia por projeto.
Quando a tarefa bate com a descricao de um deles, despache aquele especialista, nunca um
agente generico.

**O nivel D de cada especialista esta no proprio arquivo do agente**, junto com o escopo de
ferramentas dele. Nao replique aqui: duas copias divergem, e a copia errada e a que voce le.
Antes de delegar algo de risco, abra o arquivo do agente e confira o que ele pode executar —
subagente sem acesso a shell nao roda git, e essa e a unica trava estrutural que existe.

[PREENCHER opcional: especialistas proprios deste dominio que o elenco generico nao cobre.]

## Convencoes nao-negociaveis

- **Nenhum implementador faz `git commit`.** Implementador deixa a mudanca na arvore de
  trabalho e relata os arquivos tocados; quem comita e o orquestrador, uma tarefa por vez,
  capturando o `HEAD` atual imediatamente antes de cada commit. Isso e convencao declarada
  D0, nao trava: hook de comando nao distingue quem chamou `git`.
- **Toda regra nova de lint nasce em `"warn"`.** Sobe para `"error"` so quando a contagem de
  violacoes chega a zero. Nenhum portao entra bloqueante com contagem maior que zero.
- **Nenhuma alegacao de "pronto" ou "passou" sem o comando rodado no mesmo turno** e a saida
  real lida. Saida de turno anterior nao conta; memoria de que passava nao conta.
- **Nada de segredo em arquivo versionado.** Use `${VARIAVEL}`, valor real em `.env` fora do
  controle de versao. `.env.example` carrega nome de variavel, nunca valor.

[PREENCHER: convencoes desta stack — estilo de import, padrao de teste, tratamento de erro,
fronteiras de arquitetura que nao podem ser cruzadas.]

## Ponteiros

- Skill `onda-paralela` (escopo de usuario) — condicoes exatas em que despachar varios
  implementadores em paralelo continua seguro (ondas, `Files:`, `Depends-on:`). Nao ha
  regra por projeto: ela carregava em toda sessao e em todo subagente e duplicava a skill.
- Memoria de longo prazo: fora do repo (auto memory do Claude Code, ou um `CLAUDE.local.md`
  ignorado pelo git que importa suas notas). Nada de memoria dentro do repo.
- `docs/adr/NNNN-*.md` — uma ADR por decisao estruturante. Portao que nao se aplica a este
  perfil aponta para a ADR que justifica.
- `docs/specs/<feature>/intake.md` — saida do intake da feature.
- `scripts/README.md` — o que cada portao executavel faz, tier, e os dois codigos de saida.
- `package.scripts.json` — o bloco de `scripts` por perfil, pronto para colar.
