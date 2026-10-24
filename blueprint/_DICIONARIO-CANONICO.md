# Dicionário canônico — fonte única da verdade

> **Este arquivo existe porque a primeira tentativa falhou.** Sete partes foram escritas em
> paralelo e cada uma inventou seu próprio nome de portão, sua própria definição de `verify`
> e seu próprio procedimento de classificação. Resultado: `test:dedup` e `test:dedupe` para
> o mesmo portão, dois `verify` incompatíveis para SITE, duas matrizes se contradizendo
> célula a célula.
>
> **Regra:** nenhuma parte do blueprint define nome de portão, comando ou procedimento por
> conta própria. Tudo vem daqui, citado por nome. Uma parte que precisa de um portão que não
> existe aqui **acrescenta aqui primeiro**, e só depois usa.

---

## 1. A regra de nomenclatura

Três prefixos, sem exceção. A regra existe para você conseguir prever o nome de um portão
que ainda não leu.

| Prefixo | Significa | Roda contra | Exemplo |
|---|---|---|---|
| `test:*` | Executa código do projeto e afirma comportamento | Código-fonte, banco de teste | `test:rls`, `test:authz` |
| `<coisa>:check` | Verifica um artefato ou ambiente que já existe | `dist/`, URL, config, git | `headers:check`, `links:check` |
| `<coisa>:<verbo>` | Ação que produz ou transforma algo | Qualquer | `db:migrate`, `release:dry-run` |

**Regra dura:** o nome é a interface; o comando é a implementação. Trocar de stack é editar
o `package.json`, nunca o harness, o hook ou o CI — que só conhecem nomes.

**Corolário:** um nome que não se aplica ao seu perfil **existe mesmo assim** e sai com 0,
imprimindo uma linha que aponta para a ADR que justifica. Um `script not found` é
indistinguível de setup quebrado.

---

## 2. Os portões, por nome

Lista fechada. `SI` = SITE · `AP` = APP · `SA` = SAAS · `CR` = CRM.
✅ obrigatório · ⚠️ condicional (a condição está na coluna) · — não se aplica.

### 2.1 Correção e forma

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `typecheck` | Zero erro de tipo | ⚠️¹ | ✅ | ✅ | ✅ |
| `lint` | Zero warning novo | ✅ | ✅ | ✅ | ✅ |
| `test` | Suíte unitária + integração verde | ⚠️¹ | ✅ | ✅ | ✅ |
| `build` | Compila | ✅ | ✅ | ✅ | ✅ |

¹ SITE sem TypeScript e sem lógica própria pula os dois. Se existe um `.ts` ou um `if`, não pula.

### 2.2 Controle de acesso — a classe que nenhum scanner pega

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `test:authz` | Matriz papel × ação devolve o status esperado | — | ✅ | ✅ | ✅ |
| `test:idor` | Recurso de outro dono responde 404, não 403 | — | ✅ | ✅ | ✅ |
| `test:rls` | Isolamento no banco: lê, grava, sem contexto, e toda tabela com RLS | — | ⚠️² | ✅ | ⚠️⁷ |
| `test:auth` | Sessão, rotação de refresh, enumeração de usuário | — | ✅ | ✅ | ✅ |

² APP só tem `test:rls` se usar BaaS com acesso direto do cliente ao banco. Com API própria
na frente, o portão de isolamento é `test:authz` + `test:idor`.

⁷ **CRM single-tenant não tem o que provar aqui.** Sem separação entre clientes, um teste de
isolamento de tenant nunca reprova — e a seção 12 chama isso pelo nome: portão que nunca falhou
é teatro que custa tempo de CI. Duas saídas honestas, nessa ordem de preferência:
**(a)** reescrever `test:rls` como isolamento **por papel e por dono do registro** em vez de por
tenant — aí ele volta a ter o que provar; **(b)** ADR declarando que não se aplica, e o script
sai 0 apontando para ela. O que não vale é manter o nome marcado obrigatório num portão vazio.
Em CRM multi-tenant, `test:rls` é ✅ sem ressalva.

**O portão que substitui `test:rls` num CRM single-tenant é `test:idor`**, e ele fica mais
importante, não menos: sem fronteira de banco, a única coisa entre o usuário A e o registro do
usuário B é o código.

### 2.3 Entrada, saída e dado

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `test:input` | Schema `.strict()`, sanitização de saída, upload por magic bytes | ⚠️³ | ✅ | ✅ | ✅ |
| `test:contract` | Resposta real da API satisfaz o schema | — | ✅ | ✅ | ✅ |
| `test:logging` | Nenhum campo PII em log | — | ✅ | ✅ | ✅ |
| `test:erasure` | Eliminação de titular apaga de verdade — inclusive backup, réplica, cache e índice | — | ⚠️⁴ | ⚠️⁴ | ✅ |
| `test:import` | Importação em massa: linha inválida, tamanho, CSV injection | — | — | — | ✅ |
| `test:dedupe` | Merge por chave determinística; heurística sugere e para | — | — | — | ✅ |
| `test:read-audit` | Leitura de dado de terceiro deixa rastro | — | — | — | ✅ |

³ SITE só tem `test:input` se tiver formulário. Sem formulário, não há entrada.
⁴ Obrigatório assim que houver dado pessoal, independente do perfil.

### 2.4 Interface e experiência

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `test:a11y` | axe: zero violação serious/critical | ✅ | ✅ | ✅ | ✅ |
| `size:check` | Orçamento de bundle não estourado | ✅ | ✅ | ⚠️ | ⚠️ |
| `test:meta` | `<title>`, description, canonical, OG por rota | ✅ | ⚠️ | — | — |
| `links:check` | Nenhum link interno quebrado no build | ✅ | ⚠️ | — | — |
| `lh:check` | Lighthouse acima do limiar declarado | ✅ | ⚠️ | — | — |

### 2.5 Segredo, dependência e plataforma

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `secrets:scan` | Nenhum segredo na árvore de trabalho | ✅ | ✅ | ✅ | ✅ |
| `secrets:scan:full` | Nenhum segredo no histórico inteiro | ✅ | ✅ | ✅ | ✅ |
| `bundle:scan` | Nenhum segredo no artefato publicado | ✅ | ✅ | ✅ | ✅ |
| `deps:check` | Nenhuma vulnerabilidade alta em dependência de produção | ✅ | ✅ | ✅ | ✅ |
| `sast` | Análise estática sem erro | ⚠️ | ✅ | ✅ | ✅ |
| `headers:check` | CSP, HSTS e demais cabeçalhos, **contra URL publicada** | ✅ | ✅ | ✅ | ✅ |

### 2.6 Ponta a ponta

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `test:e2e` | Fluxo crítico de usuário funciona contra a aplicação de verdade | ⚠️⁵ | ✅ | ✅ | ✅ |

⁵ SITE só tem `test:e2e` se houver fluxo com mais de um passo — formulário com confirmação,
carrinho, checkout. Página que só apresenta conteúdo é coberta por `links:check` e `test:meta`.

### 2.7 Meta — portões sobre o próprio processo

| Nome | O que prova | Tier | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `profile:check` | O perfil declarado ainda corresponde ao código | 2 | ✅ | ✅ | ✅ | ✅ |
| `tree:check` | Árvore de trabalho limpa: nada não commitado, nada em stage | 2 | ✅ | ✅ | ✅ | ✅ |
| `pr:check` | Diff dentro do teto de linhas | 3 | ✅ | ✅ | ✅ | ✅ |
| `hooks:check` | Todo hook responde certo nos quatro payloads ilegíveis e está registrado no `settings.json` | 3 | ✅ | ✅ | ✅ | ✅ |
| `cost:check` | Custo da feature dentro do orçamento declarado | 3 | ⚠️⁶ | ⚠️⁶ | ⚠️⁶ | ⚠️⁶ |

⁶ **`cost:check` ainda não tem implementação.** O nome está reservado e a mecânica está
descrita na Parte 12, mas nenhum script em `scripts/` o implementa. Enquanto isso, medir custo
por feature é **D1**: você lê o número e decide. Nenhuma parte do documento pode apresentá-lo
como portão automático.

**`tree:check` existe por um motivo de plataforma.** O teste natural seria
`git diff --quiet && git diff --cached --quiet` — mas `&&` é erro de parse no PowerShell 5.1,
que é o console padrão do leitor. Um portão que só roda em bash não é portão. Por isso o par
de comandos virou `scripts/tree-check.mjs`, com nome no dicionário.

---

## 3. `verify` — uma definição por perfil, e só uma

**`verify` é o tier local.** Ele é o comando único da Parte 10 pergunta 1. Tudo que precisa
de navegador, banco, rede ou deploy **fica fora dele** — por isso existem os outros tiers.

```jsonc
{
  "scripts": {
    // ---- SITE ----
    "verify": "pnpm profile:check && pnpm lint && pnpm build && pnpm size:check && pnpm test:meta && pnpm links:check && pnpm bundle:scan",

    // ---- APP / SAAS / CRM: mesma forma, conteúdo cresce ----
    // APP:  profile:check lint typecheck test build size:check test:authz test:idor bundle:scan
    // SAAS: idem APP + test:input test:logging
    // CRM:  idem SAAS + test:dedupe
  }
}
```

Os quatro compartilham a mesma espinha: `profile:check` primeiro (é o mais barato e invalida
tudo se falhar), depois forma, depois build, depois o que depende do build.

### Os quatro tiers

| Tier | Nome | Teto | O que entra |
|---|---|---|---|
| 1 | pre-commit | **5 s** | `lint` no que mudou, `secrets:scan --staged` |
| 2 | `verify` (local, push) | **90 s** | Tabela acima. Nada de navegador, banco ou rede |
| 3 | `verify:ci` | **10 min** | `test:rls`, `test:contract`, `test:a11y`, `lh:check`, `sast`, `deps:check` |
| 4 | `verify:deploy` | livre | `headers:check`, `test:e2e` contra preview |
| 5 | noturno | livre | `secrets:scan:full`, DAST, canários de portão |

**Regra dura:** `verify` local acima de **120 s** muda de tier no mesmo dia. Portão local não
compete com CI — compete com não rodar. Um `verify` de 8 minutos vira `--no-verify`.

**`headers:check` nunca entra em `verify`.** Cabeçalho só existe depois do deploy. Rodar
antes é teatro, e um portão que nasce vermelho é um portão que se aprende a pular.

---

## 4. Classificação de perfil — um procedimento só

Três perguntas, resposta binária, **ordem fixa**.

```
P1. O sistema tem sessão de usuário — alguém faz login?
    NÃO  -> SITE.  Pare.
    SIM  -> siga.

P2. O dado principal é de pessoa que NÃO é usuária do sistema?
    SIM  -> CRM.   Pare. (siga para "as duas variantes de CRM", abaixo)
    NÃO  -> siga.

P3. Clientes diferentes precisam ficar invisíveis um para o outro?
    SIM  -> SAAS.
    NÃO  -> APP.
```

**A ordem entre P2 e P3 foi corrigida depois do primeiro uso real.** A versão anterior
perguntava isolamento antes de dado de terceiro, o que fazia um CRM de uma empresa só cair em
APP: ele não tem tenant, então parava em P3 e nunca chegava à pergunta que descreve o risco
dele. Um CRM single-tenant não deixa de guardar dado de quem nunca aceitou nada — perde só a
fronteira entre clientes, não a obrigação com o titular.

### As duas variantes de CRM

CRM **não** exige multi-tenancy. A pergunta que separa as duas variantes é a P3, feita depois:

| Variante | P3 | O que muda |
|---|---|---|
| **CRM single-tenant** | NÃO | Uma empresa gerindo a própria base. Sem tenant, os portões de isolamento entre clientes não têm o que provar. |
| **CRM multi-tenant** | SIM | Vários clientes, cada um com a própria base de terceiros. Vale tudo de SAAS **mais** tudo de CRM. |

Nas duas, `test:erasure`, `test:import`, `test:dedupe` e `test:read-audit` são obrigatórios: eles
protegem o titular, não a fronteira. O que muda é só `test:rls` (ver 2.2, nota ⁷).

**Registre a variante numa ADR.** É o que faz `test:rls` sair 0 com justificativa em vez de
nunca reprovar em silêncio — e portão que nunca pode reprovar é teatro, não portão.

**Mão única.** Na dúvida entre dois, escolha o mais alto. Complexidade que aparece no meio
do caminho faz o perfil **subir**, nunca descer. Descer de perfil é decisão D0, com ADR.

**Perfil declarado em arquivo versionado**, na raiz: `.perfil` com uma linha
(`SITE` | `APP` | `SAAS` | `CRM`). É o que `profile:check` lê.

---

## 5. Convenção de script — obrigatória

O leitor trabalha em **Windows**. Script que só roda em macOS não é portão, é aspiração.

| Regra | Por quê |
|---|---|
| Todo script próprio é **`.mjs` (Node)**, nunca `.sh` | Node já é dependência obrigatória; bash e `jq` não existem no Windows |
| Nada de aspas simples em `package.json` | `cmd.exe` não as interpreta; `'vite` vira o argumento |
| Nada de `&&` dentro do valor de um script que precise rodar no PowerShell | Use encadeamento via `pnpm` ou um `.mjs` orquestrador |
| Nada de `bash scripts/x.sh` | Git Bash não é garantido no `PATH` |
| Todo hook lê stdin com o helper de leitura segura | `JSON.parse("null")` retorna `null` **sem lançar erro** |
| Todo hook sai com `0` ou com o código de bloqueio documentado — nunca um terceiro | Exceção não tratada saindo com `1` é bug do hook, não decisão |
| Todo script proposto no documento foi **executado** nos três casos antes de entrar | Bloco de código nunca rodado é prosa com destaque de sintaxe |

**Fail-open × fail-closed, resolvido:** hook que **adiciona** melhoria (lembrete, formatação,
contexto) falha **aberto**. Hook que **impõe** limite de segurança falha **fechado**. Se você
está em dúvida sobre qual dos dois um hook novo é, essa dúvida já é o sinal de que a decisão
precisa estar escrita ao lado do código.

**Ressalva sobre `&&`:** a proibição acima vale para comando que **você digita** no PowerShell.
Dentro do valor de um script de `package.json`, `pnpm` invoca o `cmd.exe`, onde `&&` funciona —
por isso as correntes de `verify` na seção 3 podem usá-lo. A regra é: `&&` em `package.json`,
sim; `&&` numa linha que o documento manda você colar no terminal, não.

---

## 5.1 O que um hook NÃO consegue fazer

Esta seção existe porque a primeira consolidação afirmou duas garantias que os scripts não
davam — e um leitor construiria em cima delas.

**Um hook de comando não distingue quem está chamando.** A regra "implementador não comita"
(Parte 13) não vira hook por regex: o mesmo `git commit` é proibido para o implementador e
obrigatório para o orquestrador, e o hook vê os dois igual. Bloquear `git push` no atacado
ainda quebra `--force-with-lease`, que é a variante segura.

O mecanismo **estrutural** para isso não é hook, é **permissão de ferramenta do subagente**:
um subagente declarado sem acesso a shell não consegue rodar git, ponto. Onde essa permissão
não existir, a regra é convenção — e convenção se declara como **D0**, nunca como trava.

**Regra dura:** nenhuma parte do documento afirma que um script bloqueia algo sem que exista
um caso correspondente em `hooks:check` provando isso. Garantia sem caso de teste é promessa.

---

## 5.2 Catraca, hook de limite e hook de processo

**Catraca.** É o estado 2 dos quatro estados por que todo portão passa: 0 desligado, 1 aviso
com contagem, 2 catraca — reprova só se `N` subir, só quem piorou paga, promove quando `N = 0`
—, 3 bloqueante (Parte 14.1). Não é portão novo: é o estado 2 de um portão que já tem nome, e
só o `package.json` sabe em que estado ele está (Parte 14.4, "A catraca, sem script novo"). A
mecânica, em 4 passos: um arquivo versionado — o baseline — guarda o teto por alvo; contagem
**acima** do teto sai `1` (único caso de reprovação); contagem **abaixo** reescreve o teto e
sai `0`; alvo sem teto ainda grava o teto e sai `0` (Parte 14.4). O agente não edita o
baseline — quem impõe isso é o hook `protege-catraca` (Parte 14.4; catálogo da Parte 15.8,
item 3). Armadilha: dois PRs em paralelo que apertam o baseline resolvem o conflito pelo
**menor** número, e rodam o alvo de novo para recalcular (Parte 14.4).

**Regra dura:** nenhum portão entra no estado 3 com contagem maior que zero (Parte 14.1).

**Hook de limite.** Hook que resolve "limite que não pode depender de boa vontade" (Parte
15.1, tabela das cinco primitivas). Falha **fechado** (§5, "hook que impõe limite de segurança
falha fechado"). São os três de `.claude/hooks/` (§6) que passam no `hooks:check` —
`bloqueia-destrutivo`, `protege-segredo`, `protege-catraca`, modo fechado no catálogo (Parte
15.8, itens 1-3) — e os únicos que o instalador copia: "Instala só hook de limite... nunca hook
de processo" (`README.md`). Pode nascer na
semana 1 porque barra uma ação rara e inequívoca (Parte 15.10, item 1); os três podem ficar
ligados desde o dia 1, não reprovam PR nem entram em corrente de portão — o custo do falso
positivo é você rodar o comando no seu próprio terminal (`template-projeto/LEIA-ME.md`, "O que
NÃO ligar na semana 1").

**Hook de processo.** Hook que impõe um passo do fluxo em vez de barrar uma ação rara: o
`exige-intake` (Parte 15.8, item 9; Parte 15.10); exigir `verify` verde antes de commit ou
bloquear `git push` (`template-projeto/LEIA-ME.md`, "O que NAO ligar na semana 1"). Ligado
antes de saber quais perguntas importam no projeto, bloqueia coisa legítima; alguém desliga
"só por hoje", e não volta (Parte 15.10). Por isso entra só na Fase D da Parte 9, nunca na semana 1 (Parte
15.10, item 1). Decidir se um hook é limite ou melhoria, e quando ligar um hook de processo, é
**D0** — sem portão automático (Parte 15.11).

---

## 6. Arquivos e caminhos canônicos

| Caminho | O que é |
|---|---|
| `.perfil` | Uma linha: o perfil declarado |
| `.claude/hooks/payload.mjs` | Helper de leitura segura de stdin |
| `.claude/hooks/*.mjs` | Um arquivo por hook |
| `scripts/*.mjs` | Scripts de portão |
| `docs/adr/NNNN-*.md` | Uma ADR por decisão estruturante |
| `docs/specs/<feature>/intake.md` | Saída do intake |
| `security/chaves-publicas.md` | Inventário de chave que é pública **de propósito** |

---

## 7. Estrutura final do blueprint

```
blueprint-sdlc-agent-ready.md      espinha — vale para os quatro perfis
  Parte 0      princípio, três regras, D0-D3, e 0.4 perfis
  Parte 1-11   como está hoje
  Parte 12     portões: este dicionário, tiers, tetos
  Parte 13     orquestração: quantos agentes, ondas, quem comita
  Parte 14     adoção em projeto que já existe
  Parte 15     harness: primitivas e hooks portáteis
  Parte 16     índice dos perfis (ponteiro curto)

perfis/site.md    perfis/app.md    perfis/saas.md    perfis/crm.md
```

Cada arquivo de perfil segue a **mesma estrutura fixa**, para você comparar dois perfis lado
a lado sem reaprender a organização:

1. Quando este é o seu perfil (o resultado das 3 perguntas)
2. Fases que se aplicam, com o nível D de cada
3. `verify` e os tiers deste perfil — **citando nomes da seção 2, sem redefinir nenhum**
4. Segurança específica do perfil
5. Intake: quais perguntas da Parte 2 valem, e as próprias do perfil
6. Armadilhas do perfil

**Regra dura para os arquivos de perfil:** eles **citam** o dicionário, nunca o redefinem.
Um arquivo de perfil que contém a palavra `"scripts":` com uma definição divergente está
errado por construção.
