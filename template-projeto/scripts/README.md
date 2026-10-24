# `scripts/` — os portões executáveis

Índice dos scripts que o blueprint cita. **Toda parte do documento referencia um arquivo
daqui pelo caminho; nenhuma parte reescreve o código.** Nome de portão, tier e teto vêm do
`_DICIONARIO-CANONICO.md` — este arquivo não define nenhum dos três, só aponta.

Ambiente medido: Windows 11, Node v24.14.0, PowerShell 5.1 e Git Bash. Zero dependência
externa: nada de `jq`, `bash`, `gitleaks` ou `psql`.

## O índice

| Arquivo | O que faz | Nome no dicionário | Tier | Saídas |
|---|---|---|---|---|
| `payload.mjs` | `lerStdin()` + `lerEvento(raw)`: leitura de stdin que nunca lança e colapsa os quatro payloads ilegíveis num sinal só (`null`) | — (helper, dicionário §5) | — | — |
| `profile-check.mjs` | Lê `.perfil` na raiz e procura sinal de perfil **superior** ao declarado | `profile:check` (§2.7) | 2 — `verify` (§3) | `0` coerente · `2` reprovado |
| `tree-check.mjs` | `git status --porcelain` em Node: nada em stage, nada modificado, nada não rastreado | `tree:check` (§2.7) | 2 — `verify` (§3) | `0` limpa · `1` suja, ou não mediu |
| `hooks-check.mjs` | Roda cada hook de `.claude/hooks/` nos casos feliz, bloqueado e ilegível, e afirma o código de saída | `hooks:check` (§2.7) | 3 — `verify:ci` (§3) | `0` tudo passou · `1` algum caso falhou |
| `headers-check.mjs` | `HEAD` contra URL publicada: CSP, HSTS, X-Content-Type-Options, Referrer-Policy | `headers:check` (§2.5) | 4 — `verify:deploy` (§3) | `0` ok · `1` faltou / rede caiu / sem URL |
| `hooks/bloqueia-destrutivo.mjs` | `PreToolUse` matcher `Bash`. Barra reset de banco, DDL destrutivo, `push --force`, `reset --hard`, `rm -rf` | coberto por `hooks:check` | roda em toda chamada de ferramenta | `0` liberado · `2` bloqueado |
| `hooks/protege-segredo.mjs` | `PreToolUse` matcher `Write\|Edit`. Barra escrita em `.env`, `.envrc`, `.env.<x>`, `.env-<x>`, `*.pem`, `*.p12`/`*.pfx`, `id_rsa`, `credentials.json` (libera `.env.example`/`.sample`/`.template`) | coberto por `hooks:check` | roda em toda chamada de ferramenta | `0` liberado · `2` bloqueado |
| `hooks/protege-catraca.mjs` | `PreToolUse` matcher `Write\|Edit`. Barra escrita em `*baseline*.json`, `*baseline*.txt`, `.catraca/**`, `*.lintbaseline*` | coberto por `hooks:check` | roda em toda chamada de ferramenta | `0` liberado · `2` bloqueado |

**Regra dura: dois códigos de saída por script, nunca um terceiro.** Um `1` vindo de hook é
exceção não tratada, não decisão — é por isso que os três hooks terminam em `.catch()`.

**`tree:check` é o par `git diff --quiet && git diff --cached --quiet` transposto para Node**,
porque `&&` é erro de parse no PowerShell 5.1 (§2.7). Ele é mais estrito num ponto: arquivo
**não rastreado** também suja — o orquestrador commita por lista explícita de caminhos (Parte
13.6), e o que ninguém adicionou não entra em commit nenhum.

**`protege-catraca` é o que torna verdadeira a catraca da Parte 14:** o teto de dívida só
desce. Quem grava o baseline legitimamente é o alvo do portão, que roda como processo e não
como `Write`/`Edit` — o matcher estreito deixa apertar automático e exige humano para afrouxar.

## Os hooks são fail-closed, e isso é escolha declarada

Os três impõem limite de segurança, portanto **falham fechado** (dicionário §5): payload
ilegível bloqueia. Custo do falso positivo: você roda o comando no seu terminal. Custo do
falso negativo: banco apagado, histórico reescrito, chave no transcript.

| Entrada no stdin | `lerEvento` devolve | Hook fechado sai com |
|---|---|---|
| `{"tool_input":{"command":"pnpm test"}}` | objeto | `0` |
| `null` (literal) | `null` | `2` |
| vazio | `null` | `2` |
| `{"tool_input":` | `null` | `2` |
| `[]` | `null` | `2` |

O caso do `null` literal é a razão de `payload.mjs` existir: `JSON.parse("null")` **não
lança** — devolve `null`, e `typeof null === "object"` faz a guarda ingênua passar também.
O teste que separa hook de enfeite:

```powershell
'null' | node .claude/hooks/bloqueia-destrutivo.mjs; $LASTEXITCODE   # 2
'null' | node .claude/hooks/protege-segredo.mjs;    $LASTEXITCODE   # 2
'null' | node .claude/hooks/protege-catraca.mjs;    $LASTEXITCODE   # 2
```

`1` ali significa guarda ingênua. `0` significa fail-open sem ter sido projetado para isso.

## Chamada

```jsonc
// package.json — o nome é a interface, o comando é a implementação (dicionário §1)
"scripts": {
  "profile:check": "node scripts/profile-check.mjs",
  "tree:check":    "node scripts/tree-check.mjs",
  "hooks:check":   "node scripts/hooks-check.mjs",
  "headers:check": "node scripts/headers-check.mjs"
}
```

```jsonc
// .claude/settings.json — `node arquivo.mjs`, nunca `./arquivo.mjs`: o shebang não é
// executável no Windows. Barra normal sempre. Caminho sempre a partir de
// ${CLAUDE_PROJECT_DIR}: o hook roda na pasta atual da sessão, e caminho relativo morre
// em silêncio depois de um cd (saída 1 não bloqueia). hooks:check reprova o relativo.
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash",       "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/bloqueia-destrutivo.mjs\"" }] },
    { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/protege-segredo.mjs\"" }] },
    { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/protege-catraca.mjs\"" }] }
  ]
}
```

`headers:check` recebe a URL por argumento ou por `DEPLOY_URL`. Sem URL ele sai `1` — um
portão que passa sem medir nada é pior que portão nenhum.

## Duas calibragens que parecem detalhe e não são

**`profile:check` não usa `createMany`, `bulkCreate` nem `\bcpf\b` como sinal de CRM.** Os
três disparam em SAAS legítimo — uma tabela de eventos com inserção em lote, o CNPJ/CPF do
próprio assinante na cobrança. Portão que grita no caso legítimo ensina o leitor a contornar
o portão, e a partir daí ele não protege mais nada. O sinal de CRM aqui é estreito: a
criação de tabela de pessoa que não usa o sistema (`leads`, `contatos`, `prospects`…) e a
tabela `import_jobs`, que só existe quando a importação em lote virou processo. Biblioteca de
planilha ou CSV (`papaparse`, `csv-parse`, `xlsx`, `exceljs`) só conta **junto** de um desses:
sozinha ela diz como o dado chega, não de quem ele é, e APP lê planilha o tempo todo (ETL de
ERP, extrato, relatório). Sem sinal principal, o portão sai `0` e imprime um AVISO.

**`protege-segredo` libera `.env.example`, `.env.sample` e `.env.template`.** Eles carregam
nomes de variável, nunca valores, e são exatamente o arquivo que você quer que o agente
mantenha em dia. O que impede valor real de entrar ali é `secrets:scan` (§2.5), não este
hook. Bloquear `.env.example` é o falso positivo que faz o leitor desregistrar o hook.

**Armadilha:** usar `.perfil-excecoes` para calar o portão em vez de subir o perfil. A
exceção existe para o caso real e específico — uma tabela chamada `contatos` que guarda o
telefone do próprio usuário não é dado de terceiro. Duas exceções no mesmo perfil e o script
avisa: a classificação está errada, não o portão. O arquivo é versionado justamente para isso
aparecer no diff.

## Quanto custa rodar `hooks:check`

O número decide tier, então ele é medido, não estimado. Método: PowerShell 5.1, Windows 11,
Node v24.14.0, repositório aquecido (a primeira execução do dia paga disco frio e não entra
na conta), **n = 7**:

```powershell
1..7 | ForEach-Object { [int](Measure-Command { node scripts/hooks-check.mjs }).TotalMilliseconds }
1920  1966  2166  1963  1975  1995  2227   ->  min 1920 · mediana 1975 · máx 2227 ms
```

**Limite declarado: abaixo de 4 s para os 66 casos, ou ~60 ms por caso.** O segundo número é o
que sobrevive a acrescentar hook: quase todo o tempo é o `spawn` de um Node por caso. Cabe no
tier 3 (`verify:ci`, teto 10 min) da §3 sem discussão, e caberia no teto de 90 s do tier 2.
**Meça de novo antes de citar isto em outro lugar:** outra máquina, outra contagem, outro
número.

## Buracos que o dicionário precisa fechar

Registrados aqui porque a regra é acrescentar ao dicionário antes de usar, não inventar:

1. **`.perfil-excecoes` não está na §6.** O dicionário registra `.perfil`, mas não o arquivo
   de exceções que `profile:check` lê. Mesma lacuna para `.lintbaseline.json` e `.catraca/`,
   que `protege-catraca` barra e a §6 não registra.
