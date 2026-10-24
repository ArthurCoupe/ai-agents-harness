# Perfil SAAS

> Vários clientes pagantes compartilham a mesma instância e **nenhum pode ver o dado do
> outro**. É o perfil que o documento original já cobre por inteiro.

Por isso este arquivo é um **índice de leitura**: diz em que ordem ler o que já existe e
acrescenta só o que nenhuma parte cobre. Portão, tier, teto e classificação vêm do
`_DICIONARIO-CANONICO.md` — nada aqui redefine nenhum dos quatro.

---

## 1. Quando este é o seu perfil

Rode o procedimento do dicionário §4. SAAS é a combinação **P1 SIM** (existe login), **P2 NÃO**
(o dado principal é de quem usa o sistema) e **P3 SIM** (clientes precisam ficar invisíveis um
para o outro).

### A fronteira com CRM é a P2, e só ela

Em português corrente: **o dado que dá valor ao produto é de quem usa o sistema, ou de quem
nunca ouviu falar dele?** Se for o segundo, pare de ler e vá para `crm.md`. O caso ambíguo se
resolve pelo pedido de eliminação da LGPD: titular com login pede pelo próprio produto; titular
sem conta pede pelo seu cliente, e aí **você é operador** (Parte 3.9) — operador é CRM.

| Sistema | Dado principal | Perfil |
|---|---|---|
| Gestão de projetos B2B: tarefas e anexos dos próprios usuários | de quem usa | **SAAS** |
| Agendamento onde o cliente final deixa nome e telefone sem criar conta | de terceiro | CRM |
| SaaS financeiro com nome e CPF dos clientes do seu cliente | de terceiro | CRM |

Os dois últimos valem **mesmo que o produto não se chame CRM** — o perfil segue o dado.

---

## 2. Fases e níveis D

**A matriz da Parte 7 é a matriz deste perfil, sem uma célula sobrescrita.** Ela foi escrita com
`tenant_id` na cabeça: fase, artefato, portão, nível e agente candidato valem como estão.

Duas leituras que quem toca SAAS erra com frequência: **F1 tem duas linhas, não uma** — spec é
D1 com portão, e o mini threat model é D0 sem portão nenhum (Parte 3.8), por isso some do
calendário; e **nada nasce D3** — F7 e F8 sobem pela regra de promoção da Parte 0.3, depois de
rodarem D2 sem surpresa.

---

## 3. `verify` e tiers

O `verify` de SAAS está definido no dicionário §3: **é o de APP mais `test:input` e
`test:logging`**. Copie de lá — arquivo de perfil que reescreve a linha de `"scripts":` está
errado por construção. Os cinco tiers, com teto e conteúdo de cada um, estão no dicionário §3
e na Parte 12.3 — nenhum é reproduzido aqui. Quatro consequências específicas de SAAS:

- **`test:authz` e `test:idor` ficam no tier 2, custando segundos.** São duas das três falhas
  A01, e nenhum scanner as pega (Parte 3.6). Portão que pega o erro mais provável fica perto
  do teclado, não no CI.
- **`test:rls` sai do tier 2 porque precisa de Postgres no ar** — é a regra dos 90 s do
  dicionário §3, a que impede o `verify` de virar `--no-verify`.
- **`test:auth` roda no tier 3**, porque sobe sessão e não cabe nos 90 s. A linha do tier 3 no
  dicionário §3 não o lista: **falta a linha correspondente no dicionário**, e até ela existir
  isto é escolha deste perfil, não regra.
- **A nota 4 do §2.3 sempre dispara aqui:** a condição é "assim que houver dado pessoal", e o
  usuário é titular desde o primeiro cadastro. **`test:erasure` é obrigatório neste perfil.**

**O `lint` deste perfil cobre `@typescript-eslint/no-misused-promises` com checagem de tipos
nos caminhos de servidor** — rota da sua API, server action, job, edge function: tudo que roda
com segredo. A regra exige o projeto TypeScript carregado pelo parser, porque sem isso ela não
vê o tipo `Promise` e não pega o caso. Origem: lição de um CRM em produção, o `await` faltando
numa função async de autorização passou por `tsc`, `eslint` e `build` por dias, porque `Promise`
é truthy (ver `crm.md` §3). Liga como toda regra nova de lint (CLAUDE.md, Convenções): nasce em
`"warn"`, sobe para `"error"` só quando a contagem de violações chega a zero — numa base
existente isso é a catraca da Parte 14.4.

---

## 4. Segurança: um mapa para a Parte 3

A Parte 3 não foi escrita para ser lida na ordem numérica. Esta é a ordem por risco para SAAS:

| Ordem | Seção | O que sai dali | Portão que fecha |
|:--:|---|---|---|
| 1 | 3.0 + "As 5 falhas, mapeadas" | por que segurança precisa ser portão, e não lembrete | — |
| 2 | **3.1** | os 4 passos do RLS, `FORCE`, `USING`+`WITH CHECK`, `(SELECT …)`, schema `app`, `app_metadata`, as três portas dos fundos, `withTenant` | `test:rls` |
| 3 | **3.3** | as três camadas, 404 vs 403, UUIDv7/ULID, o teste por inventário de rotas | `test:idor` |
| 4 | 3.2 | a matriz papel × ação, gerada e não escrita à mão | `test:authz` |
| 5 | 3.7 | cookie `httpOnly`, TTL curto, refresh rotativo, enumeração | `test:auth` |
| 6 | 3.4 | prefixo público é contrato de publicação; BFF | `secrets:scan` · `bundle:scan` |
| 7 | 3.5 | `.strict()`, XSS é saída, upload por magic bytes, rate limit por identidade **e** IP | `test:input` |
| 8 | 3.9 | eliminação de tenant que apaga de verdade, `audit_log` com `REVOKE` | `test:erasure` · `test:logging` |
| 9 | 3.6 | o que scanner **não** pega — calibra onde investir hora | — |
| 10 | 3.11 → 3.13 | prompt de auditoria parseável, F6, checklist pré-deploy | `sast` + o F6 |

**Leia 3.1 e 3.3 no primeiro dia; o resto espera a segunda feature.** São duas das três A01, e
as que a IA mais introduz — código correto e código vulnerável são quase idênticos ali.

### 4.1 O que a Parte 3 não cobre: e-mail injection no e-mail transacional

Todo SaaS envia e-mail com nome de usuário dentro: convite, notificação, aviso de cobrança. Se
esse nome cai num **cabeçalho** da mensagem (`Subject`, `Reply-To`, `Cc`), existe vetor —
cabeçalho é separado por CRLF, e um nome cadastrado como `João Silva\r\nBcc:
lista@mil-vitimas.example` faz o seu domínio enviar spam com SPF e DKIM válidos. O dano não é o
spam: é o domínio na blocklist e **todo** e-mail da empresa parando de ser entregue, cobrança
inclusive — recuperar depende de terceiro e leva dias.

Duas regras fecham a classe: **nenhum campo do usuário monta cabeçalho** (`Subject` é constante
ou template seu; `Reply-To` só recebe valor que passou por `z.string().email()`), e **todo
campo de texto rejeita `\r` e `\n`**, exceto o corpo — em Zod, um `.regex(/^[^\r\n]*$/)` no
schema que já existe. Isso é `test:input` (dicionário §2.3), não portão novo: mesma suíte que
prova `.strict()` e magic bytes, com um caso por campo que alimenta e-mail.

### 4.2 O que a Parte 3 não cobre: API própria na frente do banco

A Parte 3.1 desenvolve o lado do BaaS — *"RLS não é defesa em profundidade, é a única defesa"*.
O outro lado é onde a maioria dos SaaS em Node/Express acaba: o navegador fala com a **sua**
API, e só ela fala com o Postgres.

| | Navegador → BaaS | Navegador → sua API → Postgres |
|---|---|---|
| Quem impõe o isolamento | RLS, sozinho | middleware e service; RLS é a segunda camada |
| RLS falho significa | base pública na internet | exposto **se** o código errar |
| Middleware falho significa | não existe middleware | vazamento cross-tenant completo |
| Onde mora a prova | `test:rls` | `test:authz` + `test:idor` |

**RLS deixa de ser a única defesa e vira defesa em profundidade.** É melhor — e é exatamente
onde nasce a armadilha.

#### RLS ligado com ZERO policy não está protegendo: está negando tudo

A sequência é sempre a mesma: alguém roda a query da Parte 3.1 (`pg_tables … NOT rowsecurity`),
vê seis tabelas, liga RLS nas seis com um `ALTER TABLE` de uma linha, roda a query de novo,
recebe vazio, marca o primeiro item do checklist 3.13 e dorme tranquilo. O que ficou de pé:

- **Sem policy, RLS é `deny all`.** Não existe "ligado e permissivo": a ausência de policy nega
  toda leitura e toda escrita de papel comum. A tabela não está trancada — está morta.
- **O dono da tabela escapa.** `ENABLE` não vale para ele; só `FORCE` vale (Parte 3.1, passo
  2). Service role pula RLS por definição (terceira porta dos fundos).
- **Se a sua API conecta com o dono da tabela ou com service role — o default de quem roda
  migration pela mesma string de conexão da aplicação — ela atravessa por cima.** O resto do
  mundo está barrado; a sua aplicação, não. Todo o controle de quem vê o quê vive no
  middleware, e o banco não tem opinião sobre isso.

A query da Parte 3.1 só olha `rowsecurity` e não separa os dois estados. Esta separa:

```sql
-- tabelas com RLS ligado e NENHUMA policy: negando tudo, protegendo nada
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public' AND t.rowsecurity AND p.policyname IS NULL;
```

Vazio significa que toda tabela com RLS tem ao menos uma policy. Cada linha que voltar é uma
decisão de arquitetura ainda não tomada, com aparência de item de checklist resolvido.

**Armadilha:** o terceiro dos quatro testes da Parte 3.1 — *"sem contexto, enxerga zero"* —
**passa verde numa tabela sem policy**, porque nada passa. É o portão que nunca reprova da
Parte 8: não mede isolamento, mede que a tabela está fechada para um papel que a sua aplicação
não usa.

Duas saídas, e escolher é **D0** — a ADR de isolamento de tenant que a Parte 9, Fase A, pede:

1. **Escrever as policies.** RLS vira defesa em profundidade de verdade: `FORCE` ligado, API
   conectando com papel **não-dono**, contexto entrando por `withTenant` (Parte 3.1) com o
   `true` do `set_config` — sem ele o setting fica na conexão e vaza para a próxima requisição
   que pegar aquela conexão do pool.
2. **Assumir que o controle é do código.** Registre na ADR que o RLS está em `deny all`
   proposital e que a prova de isolamento é `test:authz` + `test:idor` — o raciocínio da nota 2
   do dicionário §2.2, escrita para APP, aplicado aqui.

**Nas duas, `test:rls` continua obrigatório em SAAS** (§2.2); muda o que ele prova. Na saída 2
sobra dele apenas o quarto teste da 3.1 — nenhuma tabela pública sem RLS, o que impede
regressão quando o agente criar tabela daqui a três meses. A prova de que o tenant A não lê o
tenant B passa inteira para `test:authz` e `test:idor`, no tier 2, contra a sua API, com dois
tenants no seed.

**Regra dura: com API própria, a matriz de `test:authz` e o inventário de `test:idor` são a
sua tranca — cada rota nova é uma linha faltando nos dois até prova em contrário.**

---

## 5. Intake

**As 45 perguntas da Parte 2 valem integralmente** — 5 por fase, nas nove fases, sem corte e
sem acréscimo: SAAS é o perfil default do documento e o inventário foi calibrado para ele.
Pergunta só sai quando você mediu que recebe a mesma resposta cinco vezes, e aí vira linha no
`CLAUDE.md` (Parte 11.4). O teto de 5 por fase não se negocia.

**Nove das 45 bloqueiam**, exatamente as da Parte 11.5: as cinco de F0, as duas de F1 sobre
controle de acesso, a de F2 sobre migration destrutiva e a de F6 sobre segredo com prefixo
público. As outras 36 o agente responde sozinho e marca `SUPOSIÇÃO:` no artefato. As de F1 são
as que mais pagam aqui, pelo motivo que a própria 11.5 dá: são as únicas cujo erro **não tem
portão que pegue depois** — um `tenant_id` fora do modelo não aparece em teste vermelho,
aparece em incidente.

---

## 6. Armadilhas do perfil

**Tenant de uma pessoa só classificado como APP.** `tenant_id` igual a `user_id` hoje não
sobrevive ao primeiro cliente que contrata um assistente. Subir depois é migration em toda
tabela, backfill com registro órfão ("de qual tenant é esta linha?") e reescrita de policy, com
a base cheia. Se a resposta honesta é "talvez vire multi-tenant", já nasça SAAS com um tenant
só — classificação é de mão única (dicionário §4).

**Rota sem `:id` e sem sessão não entra em nenhum dos dois inventários.** Webhook de cobrança e
aceite de convite mudam estado de tenant, não têm `:id` de recurso — escapam do filtro do
`test:idor` (Parte 3.3, que varre `rotasPorId`) — e não passam por `requireAuth` — escapam da
matriz de papéis (Parte 3.2), que pressupõe ator autenticado. Ponha as duas na matriz de
`test:authz` com ator `anon`: assinatura inválida → 401; convite de outro tenant → 404.

**Suporte que "entra como o cliente".** Impersonação com service role pula RLS por definição
(Parte 3.1) e não aparece na matriz papel × ação, porque durante a sessão o ator *é* o cliente.
Se existe, é linha de `test:authz`: só o papel de suporte alcança, e a trilha grava **antes**
da resposta. Se essa linha não dá para escrever, é D0 e a decisão vai escrita para a ADR.

**`tenant_id` em todo log × nenhum PII em log.** A F7 exige `tenant_id`, `request_id` e
`user_id` em todo log estruturado; `test:logging` reprova PII em claro. Não é contradição:
identificador opaco não é dado pessoal legível, e-mail e CPF são. A armadilha é o campo de
conveniência — logar `user.email` "para o debug" põe o log inteiro sob a retenção do seu
provedor de log, não sob a sua política (Parte 3.9).
