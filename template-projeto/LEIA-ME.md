# Template de projeto — como usar

O que se copia para dentro de um projeto real, em que ordem ligar, e o que **nao** ligar na
semana 1. Nomes de portao, tiers e tetos vem de `_DICIONARIO-CANONICO.md`; este arquivo nao
define nenhum dos tres.

## O que copiar

| De | Para | Editar depois de copiar |
|---|---|---|
| `CLAUDE.md` | raiz | sim — todo `[PREENCHER]` |
| `.perfil` | raiz | sim — uma linha, so a palavra. `profile-check.mjs` faz `trim().toUpperCase()`: comentario na linha quebra o portao |
| `package.scripts.json` | raiz (referencia) | sim — copie so o bloco do seu perfil para dentro do `package.json` |
| `scripts/` | raiz | nao |
| `.claude/hooks/` | raiz | nao |
| `.claude/settings.json` | raiz | so se ja existir um — nesse caso funda os blocos `hooks` a mao |

Memoria de longo prazo: fora do repo (memoria automatica do agente, ou um `CLAUDE.local.md`
ignorado pelo git que importa suas notas). Nada de memoria dentro do repo.

Copiado, confira que a maquinaria responde antes de ligar qualquer portao:

```powershell
node scripts/profile-check.mjs      # 0 = perfil declarado coerente com o codigo
node scripts/hooks-check.mjs        # 0 = todo hook responde certo nos payloads ilegiveis
'null' | node .claude/hooks/bloqueia-destrutivo.mjs; $LASTEXITCODE   # 2 = fail-closed de verdade
```

`1` no terceiro significa guarda ingenua; `0` significa fail-open sem ter sido projetado para
isso. Os dois sao defeito do hook, nao decisao.

## De onde vem correcao do harness

Toda correcao do harness nasce em `template-projeto/`. Para levar a um projeto: `node
instalar-harness.mjs <projeto> --dry-run`, na raiz deste repositorio, lista o que difere (`MERGE`); rodar sem
`--dry-run` gera os `.harness-novo`; o merge entra no projeto pelo fluxo dele. Correcao que
nascer num projeto so fecha depois de chegar aqui.

## A ordem de ligar

**Comece de onde a base realmente esta, nao de onde voce gostaria que ela estivesse.** E o
primeiro portao bloqueante tem que ser um que **ja passa limpo hoje** — senao o segundo passo
ensina o time a contornar portao.

| # | Passo | Custo | Nasce verde? | Portao |
|---|---|---|---|---|
| 0 | Diagnostico: medir, nao corrigir. Uma linha de `campo:valor` | horas | — | nenhum |
| 1 | Tratar o que o diagnostico marcou como **incidente** (segredo vivo, tabela sem RLS com o navegador falando direto com o banco) | horas a dias | — | fura a fila |
| 2 | `.gitattributes` + renormalizacao de fim de linha | minutos | sim | `tree:check` |
| 3 | CI rodando `build`; `secrets:scan` no que esta em stage | minutos | **sim** | `build`, `secrets:scan` |
| 4 | `.perfil` + `CLAUDE.md` + o bloco de scripts do perfil | horas | sim | `profile:check`, `verify` |
| 5 | Catraca de `typecheck` e `lint` (estado 2: reprova so se a contagem subir) | horas | **sim, por construcao** | `typecheck`, `lint` |

Passos 2 a 5 somados custam menos de um dia e nascem verdes. Esse dia compra o direito de
propor `test:rls`, `test:authz` e `test:idor` depois — porque a essa altura CI vermelho
significa "voce quebrou algo", nao "o CI esta sempre vermelho".

**Todo portao tem quatro estados, e nenhum pula direto para o quarto:** 0 desligado ·
1 aviso com contagem, sai 0 · 2 catraca, reprova so se a contagem subir · 3 bloqueante.
**Regra dura: nenhum portao entra no estado 3 com contagem maior que zero.**

## O que NAO ligar na semana 1

**Hook de processo ligado cedo demais vira a coisa que voce desliga — e uma vez desligada,
nao volta.** Religar custa o mesmo que ligar, mais o custo politico de ja ter falhado uma
vez. Sexta 19h, hotfix pronto, cliente esperando: a decisao e sempre `--no-verify`.

Deixe para depois:

- **`verify` completo como pre-push.** Antes de existirem os comandos reais, a corrente e um
  desfile de `ESTADO 0`. Ligue `verify` quando pelo menos `build` e `lint` tiverem comando.
- **Hook que exige `verify` verde antes de commit, ou que bloqueia `git push`.** Bloquear
  `push` no atacado quebra `--force-with-lease`, que e a variante segura.
- **`test:rls`, `test:authz`, `test:idor`, `test:contract`, `sast`, `size:check`,
  `pr:check` — todos de uma vez.** No maximo **um portao novo por semana**. Seis portoes
  novos nao somam seis chances de reprovar: multiplicam a chance de um PR qualquer passar em
  todos, e nenhum foi medido contra a base antes.
- **`headers:check` em `verify`.** Nunca. Cabecalho so existe depois do deploy — e tier 4,
  contra a URL de preview.
- **Refactor como primeira tarefa de agente.** Refactor em brownfield nao tem portao: o
  portao de um refactor e "os testes continuam passando", e voce mediu zero teste.

Os tres hooks de `.claude/hooks/` sao excecao e podem ficar ligados desde o dia 1: eles
barram acao destrutiva, escrita em arquivo de segredo e escrita em baseline de catraca. Nao
reprovam PR, nao entram em corrente de portao, e o custo do falso positivo e voce rodar o
comando no seu proprio terminal.

## Sinal de parada

Prova de conceito — **sem usuario externo E sem dado real de pessoa E sem dominio proprio**,
as tres — nao adota nada disto. Falhou qualquer um dos tres criterios, deixou de ser prova de
conceito. Mesmo em projeto com desligamento marcado entram tres coisas: `secrets:scan:full`
no historico inteiro, a consulta de tabelas sem RLS voltando vazia, e `.env` fora do
versionamento. As tres defendem contra o passado, que continua explorável depois do
desligamento. Seguranca e a unica linha sem sinal de parada.
