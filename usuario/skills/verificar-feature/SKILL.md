---
name: verificar-feature
description: O portão de saída. Use SEMPRE ao final de qualquer implementação, correção ou refactor — antes de dizer "pronto", "funciona", "corrigido", "deve resolver" ou de abrir PR. Roda os portões do tier 2 do perfil declarado em .perfil, na ordem, parando no primeiro erro, e devolve relatório com a saída real de cada um. Editar arquivo com sucesso não é entregar.
---

# verificar-feature

**Editar arquivo com sucesso não é entregar.** Entregar é portão verde, com a saída lida no
mesmo turno. Nomes vêm de `blueprint/_DICIONARIO-CANONICO.md` (no repositório do harness) §2; a corrente, da §3.
Toda referência § desta skill é desse arquivo.

## 1. O perfil

Leia `.perfil` na raiz — uma linha: `SITE`, `APP`, `SAAS` ou `CRM`.

Sem `.perfil`, classifique (dicionário §4), ordem fixa:

1. Tem sessão de usuário — alguém faz login? NÃO → **SITE**. Pare.
2. O dado principal é de pessoa que **não** usa o sistema? SIM → **CRM**. Pare.
3. Clientes diferentes precisam ficar invisíveis um para o outro? SIM → **SAAS**. NÃO → **APP**.

Na dúvida, o mais alto. Enquanto o arquivo não existir, siga com o conjunto de **APP** — o
meio-termo seguro — e registre `SUPOSICAO: perfil APP, .perfil ausente`. Criar `.perfil` é
D0: proponha, não decida sozinho.

## 2. Os portões, na ordem, parando no primeiro erro

Um por vez, com o gerenciador que o lockfile indica: `bun.lock` → `bun run <nome>`,
`package-lock.json` → `npm run <nome>`, `pnpm-lock.yaml` → `pnpm run <nome>`.
**Nunca digite a corrente com `&&` no PowerShell** — `&&` vale dentro
do `package.json`, não no seu terminal.

| Perfil | Corrente do tier 2 |
|---|---|
| SITE | `profile:check` `lint` `build` `size:check` `test:meta` `links:check` `bundle:scan` |
| APP | `profile:check` `lint` `typecheck` `test` `build` `size:check` `test:authz` `test:idor` `bundle:scan` |
| SAAS | idem APP, mais `test:input` `test:logging` |
| CRM | idem SAAS, mais `test:dedupe` |

Se o script `verify` existe, ele **é** essa corrente: rode `verify` pelo mesmo gerenciador e leia a saída real.
Desmonte em nomes soltos só quando `verify` não existir.

**Fora daqui:** `test:rls`, `test:contract`, `test:a11y`, `sast`, `deps:check`, `hooks:check`
e `pr:check` são tier 3; `headers:check` e `test:e2e` são tier 4 e exigem URL publicada —
rodar `headers:check` sem deploy é teatro.

## 3. Script ausente não é portão vermelho

`Missing script` / `command not found` não é reprovação nem aprovação. Se o `CLAUDE.md` ou o
`package.json` do repo declara, com outro nome, o comando que cumpre esse portão, rode o
declarado e registre `<portão> ← <comando>` no relatório. Sem essa declaração, registre
`NAO COBERTO: <nome> — sem script no package.json` e siga: não invente comando, não chame o
binário direto, não conclua que passou.

## 4. Teto de diff

`pr:check`, pelo mesmo gerenciador. Sem o script, meça e reporte o número sem afirmar aprovação:
`git diff --stat main...HEAD` (troque `main` pelo branch base). Referência: ~400 linhas por
PR; acima disso o corte é quebrar o PR.

## 5. Reinício

Qualquer correção — uma linha que seja — reinicia do passo 1. **Nunca devolva trabalho
parcialmente verificado.** Portão que passou antes da correção não conta depois dela.

## Regras duras

- **Você não para porque parece bom. Para quando os portões estão verdes.**
- **Teste instável se conserta ou se remove** — rodar de novo até passar é fraude.
- Afrouxar ou remover portão é **D0**: proponha com ADR, nunca faça no meio da tarefa.
- Sem comando rodado neste turno e saída lida, não existe "pronto".

**Projeto sem harness** — sem `package.json`, sem `scripts/`, sem teste: **não quebre e não
finja.** Rode o que existir, marque o resto como `NAO COBERTO` e diga o que falta: `.perfil`
na raiz (§4), os scripts de `template-projeto/scripts/` do harness, a corrente `verify` da §3.

## Formato fixo do relatório

```
PERFIL: <SITE|APP|SAAS|CRM>   fonte: .perfil | suposto
PORTOES
  <nome>   VERDE | VERMELHO | AUSENTE   <saída real, recortada no que importa>
  pr:check <n> linhas / teto
SUPOSICOES
  - <o que decidi sem perguntar, e por quê>
NAO COBERTO
  - <portão ausente, tier 3/4 não rodado, caminho não exercitado>
VEREDITO: PRONTO | BLOQUEADO em <portão>
```

`PRONTO` só com **todo** portão do perfil VERDE. `AUSENTE` não impede `PRONTO`, mas é
obrigatório em `NAO COBERTO` — silenciar ausência é mentir sobre cobertura.
