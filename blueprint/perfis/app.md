# Perfil APP

> Este arquivo **cita** o `_DICIONARIO-CANONICO.md` e não redefine nada dele: nome de portão,
> tier e teto vêm de lá. A espinha é o `blueprint-sdlc-agent-ready.md`; aqui só o que muda
> quando o perfil é APP.

---

## 1. Quando este é o seu perfil

Procedimento de classificação: dicionário §4. APP é o resultado de **P1 = SIM, P2 = NÃO, P3 = NÃO** —
existe login, o dado principal é de quem usa o sistema, e nenhum conjunto de dados precisa ficar
invisível para outro. Um dono, um banco,
uma fronteira de confiança: ferramenta interna, painel de uma empresa só, back-office de quem
já tem o site, app pessoal com conta.

### Fronteira 1 — o SITE que virou APP

O gatilho é literal: **apareceu login**. O ponto exato não é o formulário, é a superfície de
leitura. Um formulário de contato cujos leads você lê pelo Studio do Supabase ou pelo e-mail
continua SITE (ver `perfis/site.md`). No instante em que você constrói uma tela autenticada
para ler esses leads, o perfil é APP — agora existe controle de acesso escrito por você, e
`test:authz`, `test:idor` e `test:auth` passam de `—` para ✅ (dicionário §2.2). A travessia
é barata: o retrofit acontece com o repositório praticamente vazio.

### Fronteira 2 — o APP que virou SAAS

O gatilho: **apareceu o segundo cliente que não pode ver o primeiro**. É a travessia cara, e
o custo não está no código — está nos dados que já existem.

| Item | Nascendo SAAS com um tenant só | Retrofit com base cheia |
|---|---|---|
| `tenant_id` nas tabelas | uma coluna na migration inicial | migration em N tabelas, em janela |
| Backfill do histórico | não existe | **não tem resposta correta**: de qual tenant é o registro órfão? |
| Policies de isolamento | predicado escrito uma vez | reescrever toda policy e toda query que o RLS passou a barrar |
| Identidade | `memberships` desde o início | o mesmo e-mail passa a poder existir em duas orgs (Parte 2, F0 #2) — o modelo de identidade muda |

**Ordem de grandeza — escolha declarada deste documento, não medição:** nascer SAAS com um
tenant só custa cerca de um dia a mais; o mesmo retrofit com base cheia custa **uma ordem de
grandeza acima** — semanas, mais janela de manutenção. A linha do backfill é a única sem preço,
porque não é trabalho: é decisão irreversível tomada sob pressão.

**Regra dura: na dúvida entre APP e SAAS, o dicionário §4 é mão única — suba.** "Talvez vire
SAAS" já é resposta SIM para P3. Descer depois é decisão D0 com ADR; subir depois é a tabela
acima.

---

## 2. Fases e níveis D

As nove fases existem em APP. Nenhuma é cortada — muda a chave sobre a qual elas operam.

| Fase | Nível D | O que muda em relação à Parte 2 |
|---|---|---|
| **F0** Descoberta e domínio | **D0** | A decisão D0 desta fase é P3 do dicionário §4, olhando o roadmap de 6 meses |
| **F1** Spec e contratos | D1 | O contrato declara **dono** (`user_id`), não `tenant_id` |
| **F2** Modelagem de dados | D1 | Chave de isolamento é o dono; PII é do próprio usuário |
| **F3** Backend vertical | D2 | `withOwner` onde a Parte 3.1 escreve `withTenant` |
| **F4** Frontend vertical | D2 | Nada muda. Os quatro estados da Parte 5.3 não dependem de perfil |
| **F5** Integração e E2E | D2 | Seed são **dois donos** e um registro cruzado, não dois tenants |
| **F6** Portão de segurança | D2 | Lista fechada da seção 4 abaixo |
| **F7** Observabilidade e release | D2 | Log estruturado leva `user_id` e `request_id`; não há `tenant_id` |
| **F8** Operação | D3 | Nada muda. A regra de promoção da Parte 0.3 vale: nada nasce D3 |

---

## 3. `verify` e os tiers

Definição única, dicionário §3 — este arquivo cita, não redefine:

```
verify (APP) = profile:check → lint → typecheck → test → build → size:check → test:authz → test:idor → bundle:scan
```

**O `lint` deste perfil cobre `@typescript-eslint/no-misused-promises` com checagem de tipos
nos caminhos de servidor** — rota de API, server action, job, edge function: tudo que roda com
segredo. A regra exige o projeto TypeScript carregado pelo parser, porque sem isso ela não vê o
tipo `Promise` e não pega o caso. Origem: lição de um CRM em produção, o `await` faltando numa
função async de autorização passou por `tsc`, `eslint` e `build` por dias, porque `Promise` é
truthy (ver `crm.md` §3). Liga como toda regra nova de lint (CLAUDE.md, Convenções): nasce em
`"warn"`, sobe para `"error"` só quando a contagem de violações chega a zero — numa base
existente isso é a catraca da Parte 14.4.

**Os cinco tiers e os tetos vêm do dicionário §3 e da Parte 12.3 — não há cópia deles aqui.** O
que o perfil acrescenta é a distribuição: `test:rls` só ocupa o tier 3 quando o banco é BaaS, e
`test:contract`, `test:a11y`, `sast` e `deps:check` seguem a linha do §3. `headers:check` nunca
entra em `verify` — cabeçalho só existe depois do deploy (§3). Script medido em Windows:
`scripts/headers-check.mjs` (índice em `scripts/README.md`).

**O que a §2 exige de APP e a §3 não coloca em `verify`:** `test:auth`, `test:input` e
`test:logging`. Nenhum cabe nos 90 s do tier 2 — `test:auth` sobe sessão, `test:logging` lê
saída de log —, então rodam no tier 3. **Lacuna declarada:** nenhum dos três tem linha no tier 3
do dicionário §3, e por isso a alocação acima é acréscimo deste perfil. Feche a lacuna no
dicionário antes de copiá-la para outro arquivo.

**Portões que existem e saem com 0** (corolário do dicionário §1): `test:import`,
`test:dedupe` e `test:read-audit`, e `test:rls` quando o banco só fala com o seu servidor.
`test:meta`, `links:check` e `lh:check` são ⚠️ — a condição é existir rota pública indexável
(landing, login, convite); sem ela, saem com 0 apontando a ADR.

`profile:check` (`scripts/profile-check.mjs`) roda primeiro porque é o mais barato e reprova
no dia em que o código ganha sinal de perfil superior — o dia da Fronteira 2.

---

## 4. Segurança do perfil

**Sem tenant, o controle de acesso não some — muda de eixo.** Continua existindo **papel** (o
que você pode fazer) e **dono do recurso** (sobre qual registro). Desaparece uma das três
camadas, não a necessidade das outras duas.

### As três camadas da Parte 3.3, sem a primeira

| Camada (Parte 3.3) | SAAS | APP com BaaS | APP com API própria |
|---|---|---|---|
| 1 · TENANT — estrutural, no banco | RLS por `tenant_id` | **RLS por `user_id`** ocupa o lugar | **não existe** |
| 2 · PAPEL — declarativo, middleware | matriz papel × ação | idem, matriz menor | idem |
| 3 · RECURSO — regra de negócio, no service | checa `ownerId` | checa `ownerId` | **defesa principal** |

A leitura correta da linha 1: em APP com API própria você não ganhou menos trabalho, ganhou o
mesmo trabalho concentrado em código. Schema erra uma vez; código erra em toda rota nova.

Em APP com BaaS, o navegador fala direto com o banco, e a Parte 3.1 vale palavra por palavra —
`ENABLE` **e** `FORCE`, `USING` **e** `WITH CHECK`, `REVOKE` no `anon`, função de contexto
envolvida em `(SELECT ...)`. Só o predicado muda, de `tenant_id` para o dono. **Escreva esse
predicado numa função de contexto única**, do jeito da Parte 3.1: migrar para SAAS passa a ser
editar uma função, não N policies.

### Qual portão de isolamento é o seu

| Quem abre conexão com o Postgres | `test:rls` | Portão de isolamento |
|---|---|---|
| O navegador, com a chave `anon` do BaaS | ✅ obrigatório | `test:rls` + `test:idor` |
| Só o seu servidor (Express na frente) | ⚠️ sai com 0 + ADR | `test:authz` + `test:idor` |

É a nota 2 do dicionário §2.2. A decisão é D0: define se RLS é a única defesa ou defesa em
profundidade.

### `test:authz` — a matriz mínima de APP

| Ator | Método e rota | Esperado |
|---|---|---|
| `anon` | `GET /projects/:id` | 401 |
| dono | `PATCH /projects/:id` | 200 |
| outro usuário | `PATCH /projects/:id` | **404** |
| usuário comum | `DELETE /admin/users/:id` | 403 |

A terceira linha é a que quase sempre falta. A quarta separa papel de dono: `admin` existe em
APP — é quem administra a ferramenta — e a rota dele responde **403** ao usuário comum, porque
a regra 404/403 da Parte 3.3 esconde a *existência do registro alheio*, não a de uma rota que
está no menu.

`test:idor` é o teste da Parte 3.3 com `tenantB` trocado por `usuarioB`. O nome do portão não
muda, o predicado sim — que é a razão de o dicionário §1 tratar o nome como interface.
**ID sequencial não sobrevive a esse teste:** UUIDv7 ou ULID, nunca `serial` (Parte 3.3).

### LGPD e segredo

`test:erasure` vira obrigatório no instante em que houver dado pessoal (dicionário §2.3, nota
4). O titular aqui é o próprio usuário, então "apagar minha conta" é fluxo de produto, não
pedido jurídico — o portão existe porque a cascata para tabelas filhas quebra em silêncio
quando alguém acrescenta tabela nova.

APP interno é onde a Parte 3.4 mais é violada, com a justificativa de que "só a equipe usa".
A chave `service_role` do Supabase e qualquer `VITE_*` com valor secreto vão para o bundle
público do mesmo jeito. `bundle:scan` pega o artefato; F6 #4 bloqueia antes.

---

## 5. Intake

**São 43 perguntas e 7 bloqueios** (0.4.4). O recorte não se refaz aqui: são as 45 da Parte 2
menos as duas de F0 que pressupõem mais de uma organização assinando — #1, quem paga o contrato,
e #2, o mesmo e-mail em dois tenants. As duas bloqueiam, então os 9 bloqueios da Parte 11.5 caem
para 7. Teto da Parte 11.4 sem negociação: **máximo 5 por fase, uma rodada**.

**Os sete que bloqueiam:** F0 #3 (invariante), #4 (termos do cliente) e #5 (fora de escopo) ·
F1 #1 (o dado é por usuário ou compartilhado?) e #2 (quem lê, escreve, apaga) · F2 #5 (migration
reversível) · F6 #4 (segredo com prefixo público). As duas de F1 bloqueiam pelo motivo da Parte
11.5: authz é o único item do pipeline sem portão que o pegue depois de suposto errado — e **F1 #1
continua valendo em APP**, com o leque menor: por usuário ou compartilhado (0.4.4).

---

## 6. Armadilhas

**Armadilha: construir como SAAS "por precaução".** `tenant_id` em toda tabela de um sistema
com um dono só é complexidade que ninguém pediu, e o pior é que ela não compra segurança:

1. Um predicado que nunca é falso nunca é exercitado. `tenant_id = X` com um único X é uma
   coluna, não um isolamento.
2. `test:rls` com um tenant no seed **passa com a policy errada**. O portão fica verde e não
   prova nada — pior que não existir, porque agora você confia nele.
3. Você fica com meio modelo: tem a coluna, não tem convite, papel por organização nem troca
   de contexto. Meio-SAAS custa o SAAS e garante o APP.

A decisão é binária e é D0: ou você responde SIM para P3 e nasce SAAS de verdade, com dois
tenants no seed desde o primeiro teste, ou nasce APP honesto e a Fronteira 2 fica documentada
em ADR com o custo da tabela da seção 1.

**Armadilha: "é interno, ninguém vai atacar".** Interno na Vercel é internet com uma tela de login na frente. Três consequências concretas, cada uma com portão:

| Suposição | O que acontece | Portão |
|---|---|---|
| "Quem tem login é da casa" | A sessão do funcionário desligado vale até o refresh expirar | `test:auth` |
| "Ninguém vai trocar o ID na URL" | O estágio troca, e vê o registro do diretor | `test:idor` |
| "É interno, a chave pode ficar no front" | A chave está no bundle, que é público | `bundle:scan`, F6 #4 |

**Armadilha: seed de um dono só.** `test:idor` com um único usuário no seed passa sempre — não
há de quem roubar. O seed mínimo de APP são **dois donos e um registro cruzado por entidade**.
É a regra do F5 #2 com "tenant" trocado por "dono", e é a diferença entre um portão que roda e
um portão que mede.

**Armadilha: `.perfil` que envelhece.** Silenciar `profile:check` com exceção em vez de subir o
perfil é a Fronteira 2 mal resolvida — duas exceções no mesmo perfil e a classificação está
errada, não o portão (`scripts/README.md`).
