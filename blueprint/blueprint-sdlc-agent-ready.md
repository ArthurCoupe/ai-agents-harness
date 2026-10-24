# Blueprint de Ciclo de Vida de Software
## SaaS multi-tenant, desenhado para ser delegável a agentes

> Documento de estudo. Leia a Parte 0 com atenção — ela define o critério que justifica
> todo o resto. As Partes 1 a 6 são o pipeline. A Parte 7 é a ponte para os agentes.
> A Parte 11 é o mecanismo que faz os inventários de perguntas da Parte 2 funcionarem —
> leia as duas juntas.

---

# PARTE 0 — O princípio de projeto

## 0.1 O erro que quase todo mundo comete

A tentação é desenhar o pipeline primeiro e depois perguntar "onde encaixo IA nisso?".
Isso não funciona. Você acaba com fases que um agente não consegue executar porque não
existe forma de saber se ele terminou.

A pergunta correta é a inversa: **um pipeline agent-ready é um pipeline onde cada fase
tem uma condição de parada verificável por máquina.**

Retomando a matemática do erro composto:

```
P(sucesso do processo) = p ^ n
```

| Acerto/etapa | 5 etapas | 20 etapas | 40 etapas |
|---|---|---|---|
| 99% | 95,1% | 81,8% | 66,9% |
| 95% | 77,4% | 35,8% | 12,9% |
| 90% | 59,0% | 12,2% | 1,5% |

Uma feature vertical real (migration + repository + service + controller + contrato +
data layer + componente + rota + testes) tem 30 a 50 passos. Sem verificação
intermediária, a curva te mata.

**O portão determinístico quebra o expoente.** Se a fase 3 tem um portão que só passa
quando os testes passam, o erro não propaga para a fase 4. Você deixa de ter `p^40` e
passa a ter uma sequência de `p^5` independentes, cada uma com retry barato.

Isso é verdade **com ou sem IA**. A IA só torna o custo do erro não-detectado maior,
porque ela gera volume mais rápido do que você revisa.

## 0.2 As três regras

**Regra 1 — Toda fase produz um artefato versionado.**
Não "uma conversa", não "um entendimento". Um arquivo no repositório. Se a saída da fase
não está em `git`, a fase não existe.

**Regra 2 — Toda fase tem um portão de saída executável por comando.**
`pnpm test`, `pnpm typecheck`, um script, um linter, um snapshot de contrato. Se o
critério de pronto é "achei que ficou bom", a fase não é delegável — nem para agente,
nem para pessoa júnior.

**Regra 3 — O artefato de saída é o contrato de entrada da próxima fase.**
A fase seguinte não deve precisar do contexto da anterior, só do artefato. Isso é o que
permite paralelizar depois.

Consequência das três regras juntas: **seu SDLC vira um grafo dirigido acíclico (DAG)
com arestas tipadas.** Não porque você quis fazer "graph engineering" — mas porque é o
que sobra quando você exige artefato + portão em cada nó. O grafo é resultado, não meta.

## 0.3 Escala de delegabilidade

Notação usada no documento inteiro:

| Nível | Nome | Significado | Quem decide "pronto" |
|---|---|---|---|
| **D0** | Estratégico | Nunca delegue. O custo do erro é arquitetural e irreversível. | Você |
| **D1** | Draft assistido | Agente produz rascunho, você aprova antes de virar artefato. | Você |
| **D2** | Loop com portão | Agente itera sozinho até o portão passar. Você revisa o resultado. | O portão |
| **D3** | Autônomo | Roda sem você. Só te chama se falhar. | O portão |

**Regra de promoção:** nada nasce D3. Uma tarefa sobe de D1 → D2 quando você consegue
escrever o portão. Sobe de D2 → D3 quando ela rodou D2 umas 10 vezes sem surpresa.

---

## 0.4 Perfis de projeto — o terceiro eixo

O documento tem dois eixos: **fase** (F0–F8, Parte 1) e **delegabilidade** (D0–D3, Parte 0.3).
Falta o terceiro, e a falta aparece na Parte 7 inteira: cada célula é lida como se todo projeto
fosse SaaS multi-tenant. Exigir as 45 perguntas da Parte 2 e `test:rls` de uma landing page não
produz segurança, produz burocracia — e a Parte 11.5 já diz o que acontece com burocracia: você a
contorna, inclusive a sua própria. A correção não é afrouxar critério, é declarar **qual conjunto
de portões vale neste repositório** e manter as três regras da Parte 0.2 valendo lá dentro.

**Regra dura: o perfil muda quais portões existem, nunca a exigência de que exista portão.**

### 0.4.1 Os quatro perfis

| Perfil | Definição em uma frase |
|---|---|
| **SITE** | Publica conteúdo e não tem sessão de usuário. |
| **APP** | Tem login e dado próprio, mas existe um dono só — nada precisa ficar invisível para outro cliente. |
| **SAAS** | Vários clientes na mesma instância, e nenhum pode ver o dado do outro. |
| **CRM** | O dado principal é de pessoa que não usa o sistema e nunca contratou você, com um cliente só na instância ou vários (as duas variantes do dicionário, seção 4). |

Ordem estrita de custo: cada perfil contém os portões do anterior e acrescenta os seus (dicionário,
seção 2, colunas `SI`/`AP`/`SA`/`CR`); não existe perfil paralelo. **E CRM é classe própria, não
"SAAS com mais dado":** em SAAS o titular é seu usuário e você é controlador; em CRM ele nunca
ouviu falar de você, a base legal muda, seu papel na LGPD muda (ver Parte 3.9) e "quem viu este
registro?" vira obrigação contratual. São três portões que nenhum outro perfil tem —
`test:import`, `test:dedupe`, `test:read-audit` — e uma tabela de auditoria desenhada em F2.

### 0.4.2 Como classificar

O procedimento é o do dicionário, seção 4, e é o único — nenhuma parte define outro, nem esta.
Três perguntas binárias, **ordem fixa**: alguém faz login (P1)? o dado principal é de pessoa que
não é usuária do sistema (P2)? clientes diferentes precisam ficar invisíveis um para o outro (P3)?
NÃO na P1 é SITE. SIM na P2 é CRM, e a P3 decide só a variante. Sem dado de terceiro, a P3 separa
SAAS de APP. O passo a passo
com a saída de cada resposta fica só no dicionário: esta seção já repetiu o procedimento na ordem
anterior à correção, que levava um CRM de uma empresa só para APP.

**Classificar é D0 — revisão humana, sem portão automático**, porque a resposta depende do contrato
comercial e nenhum comando lê contrato. **Mão única:** na dúvida entre dois, escolha o mais alto;
complexidade que aparece no meio do caminho faz o perfil **subir**, e descer é decisão D0 com ADR.
O resultado vai em `.perfil` na raiz, uma linha — é o que `profile:check` lê.

### 0.4.3 Matriz mestra: fase × perfil

O nível D de cada fase, por perfil. `(Dn)` = fase condicional, condição na nota.

| Fase | SITE | APP | SAAS | CRM |
|---|:--:|:--:|:--:|:--:|
| **F0** Descoberta e domínio | D1 | D0 | D0 | D0 |
| **F1** Spec e contratos | D1 | D1 | D1 | D1 |
| **F2** Modelagem de dados | `(D1)` ¹ | D1 | D1 | D1 |
| **F3** Backend vertical | `(D2)` ² | D2 | D2 | D2 |
| **F4** Frontend vertical | D2 | D2 | D2 | D2 |
| **F5** Integração e E2E | D2 ³ | D2 | D2 | D2 |
| **F6** Portão de segurança | D2 ⁴ | D2 | D2 | D2 |
| **F7** Observabilidade e release | D2 | D2 | D2 | D2 |
| **F8** Operação e retroalimentação | D3 | D3 | D3 | D3 |

¹ Existe se houver **qualquer** tabela sua — formulário de contato conta. ² Existe se houver
código de servidor seu (rota de API, Edge Function); não existe se o formulário vai direto para
terceiro. ³ Smoke das rotas mais `links:check`. ⁴ Só os portões obrigatórios na coluna `SI` do
dicionário, seção 2. Nada além.

**F0 é D1 no SITE e D0 no resto.** O critério da Parte 0.3 para D0 é *irreversibilidade*, não
importância. Errar o modelo de domínio de um SaaS custa refazer schema com a base cheia; errar o
mapa de conteúdo de uma landing custa reescrever uma página e trocar duas rotas.

**F2 e F3 não existem no SITE — até o formulário existir.** O formulário é o ponto de virada: uma
tabela `leads` criada por SQL nasce com RLS desligado e o schema `public` é exposto pela API REST
(ver Parte 3.1). É o CVE-2025-48757 em miniatura, num projeto que ninguém classificou como "que
precisa de segurança". Por isso a linha é condicional, e a condição é *existe alguma tabela?*.

**CRM não ganha fase nova.** Criar uma "F9 — Conformidade" quebraria a Regra 3 da Parte 0.2: fase
terminal, sem consumidor a jusante e sem portão próprio, vira relatório que ninguém lê. O peso do
CRM entra onde já existe fase — retenção e eliminação em F2, trilha em F6, redação de PII em F7 —
com nome de portão vindo do dicionário, seção 2.3.

### 0.4.4 Intake por perfil

O teto da Parte 11.4 — **máximo 5 por fase, uma rodada** — não se negocia em nenhum perfil;
muda quantas das 5 sobrevivem, e isso se deriva. **A base é SAAS:** as 45 da Parte 2, 5 × 9
fases, das quais nove bloqueiam (Parte 11.5: as cinco de F0, as duas de F1 sobre controle de
acesso, a de F2 sobre migration destrutiva e a de F6 sobre segredo com prefixo público). Os
outros três saem dela por três operações, e os arquivos de perfil citam estes totais:

1. **Cai** a pergunta cujo default é seguro no perfil **e** cuja resposta errada aparece em
   portão; o bloqueio dela cai junto.
2. **Substitui, nunca acrescenta.** Resposta sempre igual vira fato e cede a vaga para a que
   o perfil torna crítica — é o que mantém o teto de 5 de pé.
3. **Bloqueia** a pergunta cujo erro não tem portão a jusante, a substituta inclusive.

| Perfil | Perguntas | Bloqueios | Como sai da base |
|---|:--:|:--:|---|
| SITE | 14 | 1 | Enumeradas abaixo; o bloqueio é F6 #4 |
| APP | 36 | 6 | Caem nove pela regra 1; três de F0 deixam de bloquear |
| SAAS | 45 | 9 | A base: sem corte, sem substituição |
| CRM | 45 | 11 | Três substituições pela regra 2; duas delas bloqueiam |

**No APP cai uma por fase onde o dono único torna o default seguro** — duas em F5 e F7,
nenhuma em F4 e F8; a derivação fase a fase está em `perfis/app.md`. Das cinco de F0 que
bloqueiam em SAAS sobram duas: #2 pressupõe segundo assinante e cai, #1 vira *quem é o dono e
quem administra*, #4 é respondida na hora por quem manda. **F1 #1 continua valendo** com o
leque menor — e bloqueando: é o único item do pipeline sem portão que o pegue depois.

**No CRM a regra 2 é a regra inteira.** Pergunta cuja resposta em CRM é sempre a mesma virou
fato e saiu (F2 #1, F3 #5, F6 #1); no lugar entram base legal e retenção do dado de terceiro,
gravação na trilha antes de responder, e quem dentro do tenant pode ver o registro. As
substitutas de F2 e F6 bloqueiam, e é daí que saem os 11.

**As 14 do SITE**, por número da Parte 2: F0 #4 e #5 · F1 #5, mais uma própria (a fonte da verdade
do conteúdo é código ou CMS, e quais rotas são indexáveis?) · F2 nenhuma, ou #3 e #4 se houver
formulário · F3 nenhuma · F4 #1, #3, #4 e #5 · F5 #1 · F6 #4 e #5, mais uma própria (quais
domínios de terceiro o site carrega, e a CSP libera exatamente esses?) · F7 #1 e #5.

**O único bloqueio do SITE é F6 #4, segredo com prefixo público**, pelo motivo da Parte 11.5: é o
único erro do pipeline que já nasce publicado — um `VITE_RESEND_API_KEY` numa landing page é tão
irrecuperável quanto num CRM. A pergunta própria de F6 existe porque a superfície de ataque de um
site não é o seu código, é o script colado no `<head>`; ela tem portão `headers:check`.

### 0.4.5 O que não muda

**Regra dura: perfil menor significa menos portões, nunca portão mais frouxo.** `test:a11y` com
zero violação serious/critical não vira "poucas violações" porque é só um site.

### 0.4.6 `profile:check` — o portão que mantém o perfil honesto

O perfil é um artefato (Regra 1 da Parte 0.2), e artefato sem portão apodrece. O portão é
`profile:check` (dicionário, seção 2.6 — obrigatório nos quatro perfis), implementado em
`template-projeto/scripts/profile-check.mjs`: Node puro, zero dependência, roda igual
no PowerShell e no CI. Ele **não classifica** — classificar é o procedimento da 0.4.2, respondido
uma vez. Ele lê `.perfil` e procura sinal de perfil **superior** ao declarado: `supabase.auth.` e
`signInWith(` para APP, `tenant_id` e `organization_id` para SAAS, tabela de lead ou contato e
`import_jobs` para CRM (`papaparse`/`xlsx` só contam junto de um desses; sozinhos, avisam). Sai `0` coerente, `2` reprovado. Exceção legítima vai em `.perfil-excecoes`,
versionada — duas no mesmo perfil e o script avisa que a classificação está errada, não o portão.

**O portão é de mão única por construção:** só reprova com sinal *acima* do declarado. Repositório
declarado CRM nunca falha por falta de sinal, e declarar perfil alto demais custa portões extras,
não build vermelho — é essa assimetria que torna o erro conservador barato. `profile:check` é tier
2 e roda **primeiro** dentro de `verify`, porque é o mais barato e invalida todo o resto se falhar.
A composição de `verify` por perfil está no dicionário, seção 3, e na Parte 12.

### 0.4.7 Armadilha: classificar para baixo

**A armadilha é usar o perfil para fugir de trabalho.** "É só um site" quase sempre é dito sobre
algo que já tem formulário, já grava lead no Supabase e ganha login no trimestre que vem. O
retrofit não é caro pelo código — auth custa o mesmo hoje e daqui a seis meses. É caro pelos dados
que já existem: `ALTER TABLE leads ADD COLUMN user_id uuid NOT NULL` numa base cheia não tem
resposta correta, porque ninguém sabe de quem são as linhas históricas; ligar RLS nas tabelas
existentes faz toda query que funcionava parar de uma vez, descoberta por tela em branco em
produção, não por teste vermelho; e a base legal dos leads já coletados nunca foi registrada.

**O agravante de agente:** o custo do retrofit escala com o volume de código, e volume é o que a IA
multiplica. As três falhas A01 da Parte 3, as que nenhum scanner pega, nascem nesse período —
escritas por um agente que perguntou zero, porque o intake do SITE (0.4.4) tem 14 perguntas e
nenhuma é sobre controle de acesso.

Como não cair: responda P1 olhando para o roadmap de seis meses, não para o sprint; rode
`profile:check` no push desde o primeiro commit, porque ele reprova no dia em que o primeiro
`signInWith` entra no repositório — o dia mais barato para descobrir; e se hesitou entre dois
perfis, é o mais alto, porque a hesitação é o dado.

### 0.4.8 Tensão com a Parte 7

No SITE, a coluna "Nível" da Parte 7 se lê pela matriz 0.4.3: F0 vira D1, F2 e F3 viram condicionais.

---

# PARTE 1 — O mapa macro

```
                    ┌─────────────────────────────────────────────┐
                    │  F0  DESCOBERTA E MODELAGEM DE DOMÍNIO  D0  │
                    │  saída: glossário + modelo de domínio + ADR │
                    └──────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  F1  ESPECIFICAÇÃO E CONTRATOS          D1  │
                    │  saída: spec.md + schema de contrato + AC   │
                    └──────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  F2  MODELAGEM DE DADOS                 D1  │
                    │  saída: migration + policies RLS + seed     │
                    └───────────┬──────────────────────┬──────────┘
                                │                      │
              ┌─────────────────▼──────┐    ┌──────────▼─────────────────┐
              │ F3  BACKEND        D2  │    │ F4  FRONTEND           D2  │
              │ repo→service→controller│    │ data→state→ui→rota         │
              └─────────────────┬──────┘    └──────────┬─────────────────┘
                                │                      │
                    ┌───────────▼──────────────────────▼──────────┐
                    │  F5  INTEGRAÇÃO E E2E                   D2  │
                    │  saída: suíte E2E verde + contrato validado │
                    └──────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  F6  PORTÃO DE SEGURANÇA                D2  │
                    │  saída: relatório assinado + testes de authz│
                    └──────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  F7  OBSERVABILIDADE E RELEASE          D2  │
                    │  saída: dashboards, alertas, tag, changelog │
                    └──────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  F8  OPERAÇÃO E RETROALIMENTAÇÃO        D3  │
                    │  saída: incidentes → regras/skills novas    │
                    └──────────────────────┬──────────────────────┘
                                           │
                                           └──────► volta para F0/F1
```

**F3 e F4 são paralelizáveis** — mas só porque F1 produziu o contrato tipado antes.
Sem F1, o paralelismo vira retrabalho. Esse é o primeiro lugar onde o desenho do
pipeline paga.

**Segurança aparece duas vezes de propósito:** como decisão transversal injetada em F1,
F2 e F3 (Parte 3), e como portão em F6. Segurança só no fim é teatro — nessa altura o
modelo de dados já está errado.

---

# PARTE 2 — As fases

## F0 — Descoberta e modelagem de domínio · **D0**

**Propósito:** decidir o que o sistema *é*. Entidades, invariantes, linguagem.

**Entrada:** conversa com stakeholder, processo atual, dor real.

**Saída (artefatos):**
- `docs/dominio/glossario.md` — cada termo do negócio com definição única
- `docs/dominio/modelo.md` — agregados, entidades, value objects, invariantes
- `docs/adr/NNNN-*.md` — uma ADR por decisão estruturante

**Portão:** revisão humana. Não existe portão automático aqui, e é exatamente por isso
que essa fase é D0.

**Por que D0:** um erro de modelagem de domínio não é um bug — é uma dívida que se
manifesta como centenas de bugs correlacionados 6 meses depois. Se você errar aqui, um
agente vai gerar 5.000 linhas *corretas* sobre uma fundação *errada*, muito rápido.

**Armadilha:** confundir "entidade" com "tabela". A tabela é consequência. Se você
começar desenhando tabela, você não modelou domínio — você modelou persistência.

**Teste de qualidade do artefato:** consegue explicar uma regra de negócio usando **só**
palavras do glossário? Se precisou inventar termo, o glossário está incompleto.


### Intake F0 — as 5 perguntas

Erro aqui é irreversível. Estas cinco não têm default: o agente **para** e espera.

| # | Pergunta | Por que é crítica |
|---|---|---|
| 1 | Quem é a unidade que assina e paga o contrato? | Define o que é `tenant`. Errar aqui é refazer o schema |
| 2 | Um mesmo e-mail pode existir em mais de um tenant? | Define o modelo de identidade. Migração posterior é dolorosa |
| 3 | Qual invariante, se violada, corrompe o negócio? | Define fronteira de transação e agregado |
| 4 | Que termos o cliente usa e você ainda não tem no glossário? | Linguagem divergente vira bug de tradução |
| 5 | O que está explicitamente **fora** do escopo agora? | Sem isso o agente projeta para requisito imaginário |

**Bloqueia?** Sim. Nenhuma tem default. Sem as cinco respondidas, F0 não fecha.

---

## F1 — Especificação e contratos · **D1**

**Propósito:** transformar intenção em critério verificável. **Esta é a fase de maior
alavancagem do pipeline inteiro.**

**Entrada:** artefatos de F0 + um recorte de escopo.

**Saída (artefatos):**
- `docs/specs/<feature>.md` — spec com critérios de aceite em formato Given/When/Then
- `packages/contracts/<dominio>.ts` — schema Zod (ou equivalente) = fonte da verdade
- Lista explícita de erros de domínio possíveis
- Mini threat model da feature (ver 3.4)

**Formato do critério de aceite — obrigatoriamente executável:**

```
DADO   um usuário com papel `viewer` no tenant A
QUANDO ele faz PATCH /contacts/:id de um contato do tenant A
ENTÃO  recebe 403 e nenhuma linha é alterada

DADO   um usuário com papel `admin` no tenant A
QUANDO ele faz GET /contacts/:id de um contato do tenant B
ENTÃO  recebe 404 (não 403 — não vaza existência)
```

Cada bloco desses vira um `it()`. Se o critério de aceite não vira teste sem tradução,
ele está mal escrito.

**Contrato como fonte da verdade:**

```ts
// packages/contracts/contacts.ts
import { z } from 'zod';

export const contactId = z.string().uuid().brand<'ContactId'>();
export const tenantId  = z.string().uuid().brand<'TenantId'>();

export const createContactInput = z.object({
  name:  z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  ownerId: z.string().uuid(),
});

export const contact = createContactInput.extend({
  id: contactId,
  tenantId,                       // presente no tipo, NUNCA aceito do cliente
  createdAt: z.coerce.date(),
});

export type CreateContactInput = z.infer<typeof createContactInput>;
export type Contact            = z.infer<typeof contact>;
```

Note o **branded type** em `contactId`/`tenantId`. Custo zero em runtime, e o
compilador passa a rejeitar `passarContactIdOndeEsperaTenantId`. Para multi-tenancy
isso não é preciosismo — é a primeira barreira contra troca de identificador.

**Portão:**
```bash
pnpm typecheck --filter contracts   # contrato compila
pnpm contracts:snapshot             # diff de contrato é intencional e revisado
```

**Delegabilidade D1:** o agente escreve o rascunho da spec e do schema a partir do
modelo de domínio. **Você aprova.** O contrato é o que trava F3 e F4 em paralelo — se
ele estiver errado, os dois lados constroem errado ao mesmo tempo.

**Armadilha:** deixar o contrato ser derivado do banco (`Prisma.Contact`) ou do
componente React. O contrato é a camada *independente* das duas pontas. No momento em
que ele vira alias do tipo do ORM, você acoplou frontend ao schema físico do banco.


### Intake F1 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | O dado é por tenant, por usuário, ou compartilhado entre tenants? | **Nenhum.** Bloqueia |
| 2 | Quem lê, quem escreve, quem apaga? Existe papel que vê mas não edita? | **Nenhum.** Bloqueia |
| 3 | Quais campos nunca vêm do cliente? | `tenant_id`, `ownerId`, `role`, timestamps, `id` |
| 4 | Que erros de domínio esta feature lança? | Deriva das invariantes de F0; declara como SUPOSIÇÃO |
| 5 | Qual o critério objetivo de pronto? | `pnpm verify` verde + os AC viraram teste |

**Bloqueia?** Perguntas 1 e 2. As duas definem controle de acesso, e controle de acesso
é o único item do pipeline sem portão que o pegue depois — as três falhas A01 da Parte 3
nascem exatamente de o agente ter suposto a resposta.

As perguntas 3 a 5 têm default seguro: ele decide, declara como `SUPOSIÇÃO:` e você vê no
review.

---

## F2 — Modelagem de dados e migrations · **D1**

**Propósito:** materializar o modelo de domínio em estrutura física, com o isolamento de
tenant garantido pelo banco (ver Parte 3.1, que é a decisão mais importante deste doc).

**Entrada:** modelo de domínio (F0) + contratos (F1).

**Saída (artefatos):**
- `prisma/migrations/NNNN_*/migration.sql` (ou equivalente) — **append-only**
- Policies de RLS junto da migration, no mesmo commit
- `prisma/seed/*.ts` — seed determinístico com ≥2 tenants
- Índices declarados com justificativa em comentário

**Checklist da fase — cada item é verificável:**

| Item | Verificação |
|---|---|
| Toda tabela de negócio tem `tenant_id NOT NULL` | script que varre o schema |
| RLS habilitado + `FORCE` em toda tabela com `tenant_id` | query em `pg_tables` |
| Toda FK tem índice | `EXPLAIN` ou script |
| Índice composto começa por `tenant_id` | inspeção de `pg_indexes` |
| Nenhuma coluna sensível sem estratégia de cifra | revisão + regra |
| Migration é reversível ou explicitamente marcada como irreversível | revisão |

**Sobre a ordem do índice composto:** em multi-tenant com shared schema, `(tenant_id,
created_at)` e `(created_at, tenant_id)` têm performance radicalmente diferente. Toda
query filtra por tenant, então `tenant_id` precisa ser o prefixo — senão o índice não é
usado para o filtro mais seletivo e você degrada de acesso por índice para varredura
parcial. Em tabela de CRM com milhões de linhas isso é a diferença entre 2ms e 2s.

**Portão:**
```bash
pnpm db:migrate:test        # migration aplica em banco limpo
pnpm db:migrate:rollback    # e desfaz (quando reversível)
pnpm test:rls               # suíte de isolamento (Parte 3.1)
```

**Delegabilidade D1:** o agente escreve a migration. Você lê antes de aplicar.
Migration é a fase com maior razão dano/linha do pipeline inteiro.

**Armadilha:** deixar o agente rodar `migrate reset` ou `migrate dev` em ambiente com
dado. Isso vai num hook de bloqueio, não numa instrução em prosa.


### Intake F2 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | Este dado tem crescimento ilimitado? | Assume que sim: cursor + índice com prefixo `tenant_id` |
| 2 | Quais consultas serão frequentes? | Deriva dos AC da F1; declara o índice escolhido |
| 3 | Delete é soft ou hard? O que acontece com os filhos? | Soft delete + `ON DELETE RESTRICT`; declara |
| 4 | Algum campo é PII? Entra na exportação e na eliminação do titular? | Marca como PII qualquer campo de pessoa e declara |
| 5 | Esta migration é reversível? | Assume que precisa ser. Se não for, **para e avisa** |

**Bloqueia?** A 5, quando a migration for destrutiva (drop de coluna, mudança de tipo com
perda, backfill em massa). Migration é a fase de maior razão dano por linha do pipeline.

**Na 4, o default é conservador de propósito:** classificar algo como PII sem necessidade
custa uma coluna cifrada a mais. Não classificar custa incidente de LGPD.

---

## F3 — Backend: implementação vertical · **D2**

**Propósito:** implementar a fatia vertical do domínio. Aqui o agente ganha autonomia
real, porque F1 e F2 já produziram o alvo e o portão.

**Ordem obrigatória de implementação — de dentro para fora:**

```
1. repository   depende de: schema do banco
2. service      depende de: repository + contratos
3. controller   depende de: service + contratos
4. testes       escritos ANTES de 1..3 quando possível (ver nota)
```

A direção da dependência define a ordem. Escrever controller primeiro força você a
inventar o service — e você inventa mal.

**Responsabilidade de cada camada — e o que a caracteriza como violada:**

| Camada | Faz | Violação típica |
|---|---|---|
| `repository` | Traduz domínio ↔ persistência. Única camada que conhece o ORM. | Retorna tipo do ORM em vez do tipo de domínio |
| `service` | Regra de negócio, orquestração, transação. Puro em relação a HTTP. | Recebe `Request` ou retorna `status: 404` |
| `controller` | Valida entrada, chama service, mapeia erro de domínio → HTTP. | Contém `if` de regra de negócio |

**O teste de fumaça da modularidade:** consigo chamar o service de um worker de fila,
de um comando CLI e de um handler HTTP sem mudar uma linha dele? Se não, ele não é
service — é controller com outro nome.

**Sobre TDD aqui:** escrever o teste antes não é dogma — é que o teste **é o critério de
parada do loop**. Sem ele, você está pedindo para o agente decidir sozinho quando parou,
e ele para cedo. Com ele, o loop tem alvo objetivo.

**Portão:**
```bash
pnpm typecheck && pnpm lint
pnpm test --filter <dominio>          # unit + integração
pnpm test:rls --filter <dominio>      # isolamento de tenant
pnpm test:coverage --filter <dominio> # não pode cair vs. baseline
```

**Delegabilidade D2:** com spec + contrato + migration + testes prontos, o agente itera
até verde. Este é o primeiro ponto do pipeline onde você recupera horas de verdade.


### Intake F3 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | Esta operação precisa ser atômica com alguma outra? | Uma transação por caso de uso do service |
| 2 | Precisa ser idempotente? | Sim para tudo que fila, webhook ou retry alcança |
| 3 | Tem efeito colateral externo (e-mail, cobrança, webhook)? Síncrono ou em fila? | Fila, sempre — nunca dentro da transação |
| 4 | O que acontece se dois usuários editarem o mesmo registro ao mesmo tempo? | Optimistic locking por `version`; declara |
| 5 | Precisa de rate limit próprio? | Só se tocar custo externo ou autenticação |

**Bloqueia?** Nenhuma. F3 tem portão forte (`test`, `test:rls`, `test:authz`, `test:idor`)
e as respostas erradas aparecem como teste vermelho, não como incidente.

**A 3 é a que mais gera retrabalho quando suposta errado.** Mandar e-mail dentro da
transação funciona no teste e falha em produção quando a transação faz rollback e o
cliente já recebeu a mensagem.

---

## F4 — Frontend: implementação vertical · **D2**

Detalhado na Parte 5. Resumo: mesma lógica, camadas diferentes.

```
1. data layer   (query/mutation tipadas pelo contrato)
2. state        (server state vs. client state — separação estrita)
3. componente   (apresentação, sem fetch, sem regra)
4. rota/página  (composição + loading/error/empty boundaries)
```

**Portão:**
```bash
pnpm typecheck && pnpm lint
pnpm test --filter web           # unit + testing-library
pnpm test:a11y                   # axe, zero violação séria
pnpm build && pnpm size-limit    # orçamento de bundle
```


### Intake F4 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | Algum dos quatro estados tem tratamento especial? | Skeleton, empty com CTA, error com retry, success |
| 2 | Atualização é otimista ou espera o servidor? | Otimista em toggle e ordenação; pessimista no resto |
| 3 | O que o usuário sem permissão vê: nada, ou desabilitado com explicação? | Esconde. Menos superfície, menos vazamento de estrutura |
| 4 | Este dado precisa ser fresco ou pode vir de cache? Por quanto tempo? | `staleTime` de 30s; invalida na mutação do próprio domínio |
| 5 | É acessível por link direto? Que estado vai na URL? | Filtro e paginação na URL; o resto em memória |

**Bloqueia?** Nenhuma. Erro de frontend tem feedback visual imediato — é a fase onde a
correção é mais barata do pipeline inteiro. Deixe o agente decidir e corrija olhando.

---

## F5 — Integração e E2E · **D2**

**Propósito:** provar que as duas pontas concordam **na prática**, não só no tipo.

**Saída:** suíte E2E cobrindo, por feature: caminho feliz, ≥1 caminho de erro de
negócio, ≥1 caminho de autorização negada, ≥1 cross-tenant negado.

**Teste de contrato** é diferente de E2E e vale a pena separar: E2E valida
comportamento; teste de contrato valida que a resposta real da API satisfaz o schema Zod.
O segundo é barato e pega quebra de contrato antes de virar bug de UI.

```ts
it('resposta real satisfaz o contrato', async () => {
  const res = await api.get('/contacts/' + seed.contactA.id);
  expect(() => contact.parse(res.body)).not.toThrow();  // portão determinístico
});
```

**Portão:**
```bash
pnpm test:e2e
pnpm test:contract
```

**Delegabilidade D2.** Escrever E2E a partir dos critérios de aceite Given/When/Then de
F1 é tradução quase mecânica — trabalho ideal para agente.


### Intake F5 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | Qual caminho, se quebrar, mais dói para o cliente? | Deriva do AC marcado como principal na F1 |
| 2 | Que seed é necessário? | 2 tenants, 3 papéis, 1 registro cruzado por entidade |
| 3 | Depende de serviço externo? Mock ou sandbox? | Mock no CI, sandbox no noturno |
| 4 | Tem fluxo dependente de tempo ou agendamento? | Relógio controlado (fake timers); nunca `sleep` |
| 5 | Qual taxa de flaky é aceitável? | **Zero.** Teste instável é removido ou consertado no dia |

**Bloqueia?** Nenhuma. Mas a 5 não é negociável mesmo sendo default: um teste flaky
ensina o agente (e você) a ignorar vermelho, e aí o portão inteiro perde o valor.

---

## F6 — Portão de segurança · **D2**

Ver Parte 3. Não é "revisar se está seguro" — é rodar uma lista fechada de verificações
com saída binária.


### Intake F6 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | Que dado desta feature viraria manchete se vazasse? | Trata todo campo de pessoa como crítico |
| 2 | Algum endpoint novo recebe ID de recurso? | Todos entram no inventário de `test:idor` |
| 3 | Alguma decisão de permissão ficou só no cliente? | Toda decisão de UI exige par no servidor |
| 4 | Entrou chave ou segredo novo? Onde ele vive? | Só no servidor. Prefixo público = **para e avisa** |
| 5 | Aceita upload ou renderiza HTML vindo do usuário? | Magic bytes + `DOMPurify`; sem exceção |

**Bloqueia?** A 4, quando houver segredo com prefixo público (`VITE_`, `NEXT_PUBLIC_`,
`REACT_APP_`, `EXPO_PUBLIC_`). É o único caso do pipeline em que o erro já nasce
publicado — não dá para corrigir depois, só rotacionar.

As outras quatro têm portão: `test:idor`, `test:authz`, `test:input`, `gitleaks`.

---

## F7 — Observabilidade e release · **D2**

**Propósito:** garantir que você descobre o problema antes do cliente.

**Saída (artefatos):**
- Logs estruturados (JSON) com `tenant_id`, `request_id`, `user_id` em todo log
- Métricas RED por endpoint: **R**ate, **E**rrors, **D**uration (p50/p95/p99)
- Traces distribuídos nas rotas críticas
- Alertas com **limiar definido antes do deploy**, não depois do incidente
- `CHANGELOG.md` gerado dos Conventional Commits
- Tag semver + release notes

**Regra dura:** nenhum log em produção pode conter PII em texto claro. Isso vira um
teste, não uma boa intenção:

```ts
it('logger redige campos sensíveis', () => {
  const out = capture(() => log.info({ user: { email: 'a@b.com', cpf: '000...' } }));
  expect(out).not.toMatch(/a@b\.com/);
  expect(out).toMatch(/\[REDACTED\]/);
});
```

**Portão:**
```bash
pnpm test:logging      # redação de PII
pnpm release:dry-run   # changelog + versão coerentes
```


### Intake F7 — as 5 perguntas

| # | Pergunta | Default se você não responder |
|---|---|---|
| 1 | Como eu descubro que isso quebrou sem o cliente me contar? | Alerta em taxa de erro e p95 do endpoint |
| 2 | Que métrica indica saúde desta feature? Qual o limiar? | RED por rota; limiar = 2× a linha de base de 7 dias |
| 3 | Que campo não pode aparecer em log? | Todo campo marcado como PII na F2 |
| 4 | Precisa de feature flag ou rollout gradual? | Flag em qualquer coisa que toque cobrança ou dado em massa |
| 5 | Como eu faço rollback depois do deploy? | Revert do código; migration já foi validada como reversível |

**Bloqueia?** Nenhuma, mas responder a 1 antes do deploy é o que separa descobrir em 5
minutos de descobrir por reclamação em 3 dias.

---

## F8 — Operação e retroalimentação · **D3**

**Propósito:** fechar o ciclo. Esta é a fase que a maioria pula e é a que faz o sistema
melhorar sozinho.

**A regra que define esta fase:**

> Quando algo dá errado, não conserte só aquele caso.
> Pergunte qual portão deveria ter pegado, e crie/ajuste esse portão.

Todo incidente vira uma de três coisas:
1. **Um teste** (o caso específico não volta)
2. **Uma regra** (a classe de casos não volta)
3. **Um hook** (a classe de casos fica impossível)

Escolha sempre o mais baixo da lista que resolva. Teste é reativo, regra é probabilística,
hook é determinístico.

**Delegabilidade D3:** triagem de erro novo no Sentry, agrupamento, PR de correção para
casos conhecidos, atualização de dependência — tudo isso roda agendado.


### Intake F8 — as 5 perguntas

Estas rodam **depois** do incidente, não antes. É o que faz o sistema aprender.

| # | Pergunta | Ação que a resposta gera |
|---|---|---|
| 1 | Qual portão deveria ter pego isso e não pegou? | Aperta o portão existente |
| 2 | É caso único, classe de casos, ou falha estrutural? | Teste / regra / hook — nessa ordem de preferência |
| 3 | Precisa de correção retroativa de dado? | Script de backfill, revisado como migration |
| 4 | Precisa notificar alguém (cliente, ANPD)? | Aciona o runbook de incidente |
| 5 | **Que pergunta de intake teria evitado isso?** | Entra no inventário da fase correspondente |

**A 5 é a que fecha o ciclo.** O inventário de perguntas não é fixo: ele cresce por
incidente e encolhe por repetição (ver Parte 11.3). Um intake que nunca muda é um intake
que não está aprendendo com a sua realidade.

---

# PARTE 3 — Segurança como camada transversal

## 3.0 Por que a IA deixa exatamente estas portas abertas

A IA não sabota. Ela entrega o que foi pedido, e **ninguém pede "e deixa trancado"**.

O motivo é estrutural: segurança é o único requisito do sistema **sem saída visual**.
Layout errado você vê. Botão quebrado você vê. Tabela sem RLS parece idêntica a tabela
com RLS — funciona igual, na sua tela, com o seu usuário. O feedback só chega via
incidente.

Consequência direta no desenho do pipeline:

> Requisito sem feedback visual **precisa** ser portão automático, porque nenhum outro
> mecanismo vai pegá-lo. Não existe "lembrar de olhar" para RLS.

Escala do problema: a Veracode encontrou falha do OWASP Top 10 em cerca de 45% do código
gerado por IA. A Symbiotic escaneou 1.072 aplicações vibe-coded e 98% tinham ao menos uma
falha — 26 passaram limpas.

**Nota sobre as fontes**, porque a versão que circula na internet troca os números: o
estudo de Stanford (Perry, Srivastava, Kumar, Boneh — CCS 2023) concluiu que devs com
assistente de IA escreveram código significativamente **menos seguro** e ao mesmo tempo
**acreditavam mais** que estava seguro. Ele não quantifica "40%". Os ~40% são de outro
estudo, da NYU (Pearce et al., *Asleep at the Keyboard*), que achou vulnerabilidade em
cerca de 40% de 1.689 programas gerados pelo Copilot.

O achado mais útil do estudo de Stanford é o que quase nunca é citado: **participantes que
confiaram menos na IA e mexeram mais no próprio prompt entregaram código com menos
vulnerabilidade.** A variável não é o modelo — é o processo em volta. É a tese do harness,
medida em experimento controlado.

### As 5 falhas, mapeadas

| # | Falha | OWASP 2025 | Fase | Portão que prova |
|---|---|---|---|---|
| 1 | Banco sem tranca (RLS desligado) | A01 | F2 | `test:rls` |
| 2 | Permissão decidida no navegador | A01 | F3 | `test:authz` |
| 3 | Rota entrega por ID sem checar dono (IDOR/BOLA) | A01 | F3 | `test:idor` |
| 4 | Chave exposta no bundle ou no Git | A02 + A04 | F6 | `gitleaks` + `bundle:scan` |
| 5 | Input sem tratamento (XSS, upload, sem rate limit) | A05 + A03 | F3 | `opengrep` + `test:input` |

**Três das cinco são A01 — Broken Access Control, o risco nº 1 do OWASP 2025.** Guarde
isso: é o dado que decide onde investir, e a seção 3.6 vai mostrar que é exatamente o que
nenhum scanner pega.

---

## 3.1 Falha 1 — Banco sem tranca

### Duas arquiteturas, dois riscos

| | BaaS (Supabase, Firebase) | Backend clássico |
|---|---|---|
| Quem fala com o banco | **O navegador do cliente** | Só o seu servidor |
| O que protege | Só RLS / Security Rules | RLS + camada de aplicação |
| RLS desligado significa | **Base pública na internet** | Exposto se o app errar |
| Superfície | REST auto-gerado, sempre ligado | Só as rotas que você escreveu |

No BaaS não há servidor no meio filtrando. **RLS não é defesa em profundidade — é a única
defesa.**

### O caso CVE-2025-48757

Divulgado em maio de 2025 por Matt Palmer: de 1.645 projetos analisados, **170 (10,3%)
tinham 303 endpoints com tabelas legíveis por requisição não autenticada usando a chave
`anon` pública.** Causa raiz: RLS ausente ou insuficiente. O atacante não precisava de
credencial — trocava a query e baixava lista de usuários, registros de pagamento, chaves
de API.

Não foi bug de plataforma. Foi o default.

### O default que morde

Tabela criada via SQL nasce com RLS **desligado**, e o schema `public` é exposto
automaticamente pela API REST. Rode isto agora:

```sql
-- toda linha que voltar é uma tabela pública na internet
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity;
```

Vazio, ótimo. Qualquer retorno é incidente em andamento, não item de backlog.

### Ligar não basta — os quatro passos

```sql
-- 1. ligar
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 2. FORCE: o dono da tabela também obedece (sem isso ele escapa)
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

-- 3. policy com USING **e** WITH CHECK
CREATE POLICY contacts_rw ON public.contacts
  FOR ALL TO authenticated
  USING      (tenant_id = (SELECT app.current_tenant_id()))   -- linhas que alcanço
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));  -- linhas que posso gravar

-- 4. revogar o que ninguém deveria ter
REVOKE ALL ON public.contacts FROM anon;
```

**`USING` sem `WITH CHECK` é meia tranca:** você lê só o seu, mas consegue **gravar** linha
no nome de outro. É a falha dentro da falha.

**Envolva a função em `(SELECT ...)`.** Chamada direta é reavaliada **por linha** — O(n)
chamadas numa varredura. Dentro de subquery com função `STABLE`, o planner avalia uma vez.
Em tabela de CRM com centenas de milhares de linhas, esses parênteses são a diferença entre
30ms e timeout. Mesmo raciocínio do `Map` vs. `find` da Parte 4.3: complexidade escondida
em código que "funciona".

### A camada de abstração — obrigatória em BaaS

Toda policy deve depender de uma função **sua**, nunca de função da plataforma. Custo: uma
hora. Retorno: trocar de fornecedor vira reescrever 3 funções em vez de N policies.

```sql
CREATE SCHEMA IF NOT EXISTS app;

-- ÚNICO ponto do banco que conhece o fornecedor
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;
```

Regra de lint: chamada a função de schema de plataforma (`auth.*`) fora do schema `app` é
erro. Vira `grep` no CI.

### As três portas dos fundos

1. **`SECURITY DEFINER`** — função ou view com essa flag roda com privilégio do criador e
   **ignora RLS**. Uma só anula o trabalho inteiro:
   `SELECT proname FROM pg_proc WHERE prosecdef = true;`
2. **Buckets de storage** — têm policy própria. RLS na tabela não protege o arquivo.
3. **Chave de service role** — pula RLS por definição. No navegador, tudo acima vira
   decoração. `anon` no cliente; service role **só** no servidor.

### Metadado editável pelo usuário

Em BaaS com JWT, o token carrega dois campos de metadado e **só um deles é confiável**:

```sql
-- ☠️ CATASTRÓFICO: user_metadata é alterável pelo próprio usuário via API
USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')

-- ✅ app_metadata exige service role para mudar
USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
```

`tenant_id` e `role` vivem em `app_metadata`, sempre. Uma chamada de API e a pessoa vira
admin do seu CRM se você errar isso.

```ts
it('usuário não consegue se promover', async () => {
  await clienteA.auth.updateUser({ data: { role: 'admin' } });
  const { data } = await clienteA.from('contacts').select();
  expect(data).toHaveLength(seed.tenantA.count);   // continua vendo só o dele
});
```

### Backend clássico: `withTenant`

```ts
export async function withTenant<T>(
  tenantId: TenantId,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
```

O `true` = `LOCAL`, morre com a transação. **Sem ele o setting fica na conexão e vaza para
a próxima requisição que pegar aquela conexão do pool.** É o bug clássico de RLS e o mais
difícil de reproduzir, porque só aparece sob concorrência.

### Os quatro testes

```ts
it('não lê linha de outro tenant', async () => { /* … */ });
it('não grava linha de outro tenant', async () => { /* WITH CHECK */ });
it('sem contexto, enxerga zero', async () => { /* fail-closed */ });

it('toda tabela pública tem RLS', async () => {              // ← o que impede regressão
  const abertas = await db.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND NOT rowsecurity`;
  expect(abertas).toEqual([]);
});
```

O quarto é o mais importante. Tabela criada por você ou pelo agente daqui a três meses
reprova o build no mesmo dia.

---

## 3.2 Falha 2 — Permissão decidida no navegador

```tsx
{user.role === 'admin' && <AdminPanel />}   // isto é UX, não segurança
```

Esconder o botão não fecha a rota. `curl` não renderiza React.

**Regra:** autorização no frontend existe para não mostrar ao usuário coisa que ele não
pode fazer. Nunca é o mecanismo de controle. O servidor decide, sempre, de novo, ignorando
o que o cliente afirmou.

```ts
// controller — papel
app.patch('/contacts/:id', { preHandler: requireRole('admin') }, handler);

// service — regra sobre o registro específico
async function update(actor: Actor, id: ContactId, input: UpdateContactInput) {
  const contact = await repo.byId(id);          // RLS já filtrou tenant
  if (!contact) throw ContactNotFound(id);
  if (contact.ownerId !== actor.id && !actor.can('contacts:update:any')) {
    throw Forbidden('CONTACT_NOT_OWNED');
  }
}
```

**O teste** — matriz papel × ação, gerada, não escrita à mão:

```ts
const matriz = [
  { papel: 'viewer', metodo: 'PATCH',  rota: '/contacts/:id', esperado: 403 },
  { papel: 'viewer', metodo: 'GET',    rota: '/contacts/:id', esperado: 200 },
  { papel: 'admin',  metodo: 'PATCH',  rota: '/contacts/:id', esperado: 200 },
  { papel: 'admin',  metodo: 'DELETE', rota: '/billing/:id',  esperado: 403 },
];

it.each(matriz)('$papel $metodo $rota → $esperado', async (c) => {
  const res = await request(app)[c.metodo.toLowerCase()](url(c.rota))
    .set('Authorization', tokenPara(c.papel));
  expect(res.status).toBe(c.esperado);
});
```

**Cheiro de que você caiu nessa:** o frontend recebe `role` e decide algo além de
renderizar. Ou pior — o frontend **envia** `role` no corpo da requisição.

---

## 3.3 Falha 3 — Rota entregando dado pelo ID (IDOR / BOLA)

`GET /invoices/1043` funciona. Troca para `1044`. Vem a fatura de outro cliente.

É o **nº 1 do OWASP API Security Top 10** e o erro que a IA mais comete, porque o código
correto e o vulnerável são visualmente quase idênticos:

```ts
// vulnerável — e passa em todo teste de caminho feliz
const invoice = await db.invoice.findUnique({ where: { id } });

// correto
const invoice = await db.invoice.findFirst({
  where: { id, tenantId: actor.tenantId, ownerId: actor.id },
});
if (!invoice) throw NotFound();     // 404, não 403
```

### As três camadas

```
1. TENANT   este recurso é do meu tenant?   → RLS (banco)      — estrutural
2. PAPEL    meu papel permite esta ação?    → middleware       — declarativo
3. RECURSO  posso tocar ESTE registro?      → service (BOLA)   — regra de negócio
```

A camada 3 é a esquecida. Ser `admin` do tenant A não implica poder editar registro cujo
dono é outra pessoa, se a regra disser o contrário.

### 404 vs 403

| Situação | Resposta | Por quê |
|---|---|---|
| Recurso de outro tenant | **404** | `403` confirma que o ID existe |
| Meu tenant, papel insuficiente | 403 | Já sei que existe |
| Meu tenant, papel ok, regra nega | 403 + código de domínio | Idem |

Com ID sequencial e `403`, um concorrente enumera sua base inteira num `for`. **UUIDv7 ou
ULID, nunca `serial`** — ordenáveis por tempo (mantêm localidade de índice, ao contrário do
UUIDv4) e não enumeráveis.

### O teste que fecha a classe inteira

```ts
const rotasPorId = inventario.filter((r) => r.path.includes(':id'));

describe.each(rotasPorId)('IDOR: $method $path', (rota) => {
  it('recurso de outro tenant → 404', async () => {
    const res = await request(app)[rota.method](
      rota.path.replace(':id', seed.tenantB.recurso(rota.entity).id),
    ).set('Authorization', tokenTenantA);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(seed.tenantB.nome);
  });
});
```

Rota nova entra no inventário e nasce testada. Diferença entre cobrir casos e cobrir a
**classe** de casos.

---

## 3.4 Falha 4 — Chave exposta

### O mecanismo

Variável de ambiente no frontend **não é secreta**. No build ela é substituída por texto
literal no JavaScript. Qualquer pessoa abre o DevTools e lê.

Os prefixos são um contrato de publicação:

```
VITE_*  ·  NEXT_PUBLIC_*  ·  REACT_APP_*  ·  EXPO_PUBLIC_*   → vão para o bundle. PÚBLICO.
```

Se tem esse prefixo, trate como publicado num outdoor. `VITE_OPENAI_API_KEY` não é
configuração — é vazamento com nome de variável.

### O padrão: BFF

```
❌  navegador ──[sk-proj-...]──► API de terceiro
✅  navegador ──[cookie]──► SEU servidor ──[sk-proj-...]──► API de terceiro
```

```ts
app.post('/ai/resumo', { preHandler: [requireAuth, rateLimit('10/min')] },
  async (req) => {
    const { texto } = resumoInput.parse(req.body);
    const r = await openai.chat.completions.create({   // chave só existe aqui
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: texto }],
    });
    return { resumo: r.choices[0].message.content };
  },
);
```

Ganhos além de esconder a chave: rate limit por usuário, quota por tenant, log de custo, e
troca de provedor sem rebuild do frontend.

### Escala

Da GitGuardian: 28,65 milhões de novos segredos em commits públicos do GitHub em 2025
(+34%, maior salto já registrado), e cerca de 70% dos segredos vazados em 2022 seguiam
válidos. Vazou não é "expôs" — é "está sendo usado".

Dois pontos que atingem quem monta agentes:

- **24.008 segredos únicos expostos em arquivos de configuração de MCP.** Seu `.mcp.json`
  é superfície de vazamento. Trate como `.env`.
- Commits assistidos por IA vazam segredo em cerca de 2× a taxa, e 59% das máquinas
  comprometidas eram **runners de CI**, não notebooks.

### Só rotação resolve

Apagar o commit não resolve — o histórico guarda, e bots varrem o GitHub 24h. O tempo médio
entre commit e coleta é de minutos.

```bash
gitleaks detect --source . -v
gitleaks detect --source . --log-opts="--all"    # histórico, inclusive branch deletada
```

Achou → **revoga primeiro, limpa o histórico depois.** Nessa ordem.

---

## 3.5 Falha 5 — Input sem tratamento

Três problemas distintos, com defesas diferentes.

### (a) Validação na borda — entrada

```ts
export const createContactInput = z.object({ /* … */ }).strict();
```

**Sempre `.strict()`.** Sem isso você aceita campo extra — e mass assignment (o cliente
manda `{ role: 'admin' }` e o ORM obedece) é dos vetores mais explorados em API.

### (b) Sanitização na saída — XSS

Validar entrada não previne XSS. XSS é problema de **saída**: depende de onde o dado é
renderizado.

```tsx
<div>{contact.name}</div>                                   // React escapa. Seguro.
<div dangerouslySetInnerHTML={{ __html: contact.bio }} />    // vetor direto
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contact.bio) }} />  // ok
```

Regra de lint: `dangerouslySetInnerHTML` sem `DOMPurify.sanitize` na mesma expressão =
erro. Reforce com CSP:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'
```

### (c) Upload

O erro é confiar na extensão ou no `Content-Type` — ambos vêm do cliente.

```ts
import { fileTypeFromBuffer } from 'file-type';

const PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX = 5 * 1024 * 1024;

async function validarUpload(buf: Buffer) {
  if (buf.length > MAX) throw TooLarge();
  const tipo = await fileTypeFromBuffer(buf);          // magic bytes, não extensão
  if (!tipo || !PERMITIDOS.has(tipo.mime)) throw UnsupportedType();
  return `${crypto.randomUUID()}.${tipo.ext}`;         // nome novo, sempre
}
```

Mais quatro regras: sirva de domínio ou bucket separado; nunca execute o diretório de
upload; `Content-Disposition: attachment` no que não for imagem; e o path **nunca** vem do
nome enviado pelo cliente (`../../etc/passwd` é um nome de arquivo válido).

### (d) Rate limit

| Endpoint | Limite | Por |
|---|---|---|
| `POST /auth/login` | 5/min, 20/h | IP **e** e-mail |
| `POST /auth/reset` | 3/h | e-mail |
| `POST /auth/otp/verify` | 5 tentativas, depois invalida o código | sessão |
| Escrita autenticada | 100/min | usuário |
| Endpoint com custo de IA | quota/dia | tenant |

Limite só por IP não serve: rotação de IP é trivial. Por identidade **e** por IP.

---

## 3.6 As ferramentas — e o que elas não pegam

### Cobertura real

| Falha | Gitleaks | Opengrep (SAST) | Bandit | ZAP (DAST) | O que realmente pega |
|---|---|---|---|---|---|
| 1 RLS desligado | ❌ | ⚠️ parcial | ❌ | ⚠️ | **`test:rls`** + query no `pg_tables` |
| 2 AuthZ no cliente | ❌ | ❌ | ❌ | ❌ | **`test:authz`** |
| 3 IDOR / BOLA | ❌ | ❌ | ❌ | ❌ | **`test:idor`** |
| 4 Segredo | ✅ | ✅ | ⚠️ | ⚠️ | Gitleaks + scan de bundle |
| 5 XSS / injeção | ❌ | ✅ | ✅ (py) | ✅ | Opengrep + ZAP |
| 5 Upload | ❌ | ⚠️ | ⚠️ | ⚠️ | teste próprio |

**Leia a coluna de IDOR e authZ: quatro ❌.**

Não é limitação de ferramenta ruim — é limitação **estrutural**. Scanner não conhece sua
regra de negócio. Ele não tem como saber que o usuário 7 não deveria ver a fatura 1044,
porque não sabe quem é dono de quê. Ele vê `findUnique({ where: { id } })` e lê código
correto.

**Consequência:** as três falhas A01 — as três mais comuns em código de IA, três das cinco
desta lista — são cobertas **exclusivamente** por testes que só você pode escrever. Scanner
é higiene necessária; a matriz de authz é a defesa.

### Instalação e uso

```bash
# ── Gitleaks — segredo no código e no histórico (MIT)
brew install gitleaks
gitleaks detect --source . -v
gitleaks detect --source . --log-opts="--all"
gitleaks protect --staged                          # pre-commit

# ── Opengrep — SAST, fork livre da Semgrep
opengrep scan --config auto .
opengrep scan --config auto --severity ERROR --error .     # bloqueia CI

# ── Bandit — só se houver Python (PyCQA)
pip install bandit
bandit -r ./seu_projeto -ll                        # -ll = medium+

# ── OWASP ZAP — DAST, precisa da app no ar
docker run -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://staging.seuapp.com -r zap.html
```

Ordem de adoção por retorno/esforço: **Gitleaks** (5 min, pega o que já vazou) →
**Opengrep** (30 min) → **ZAP baseline** em staging (1h) → **Bandit** (só se Python).

**ZAP nunca contra produção.** Ele testa ativamente — cria dado, dispara e-mail, às vezes
derruba. Staging com dado sintético, sempre.

### Onde cada uma entra

```
pre-commit ──► gitleaks protect --staged
push       ──► opengrep + bandit + test:rls + test:authz + test:idor
noturno    ──► zap-baseline contra staging
release    ──► gitleaks --log-opts=--all + audit + SBOM
```

---

## 3.7 Autenticação

| Decisão | Recomendação inicial | Justificativa |
|---|---|---|
| Sessão | Cookie `httpOnly` + `Secure` + `SameSite=Lax` | JWT em `localStorage` é exfiltrável por XSS |
| Token de acesso | 10–15 min | Reduz janela de token roubado **e** de papel revogado |
| Refresh | Rotativo, com detecção de reuso | Reuso detectado revoga a família inteira |
| Senha | Argon2id, ou bcrypt custo ≥ 12 | Nunca SHA/MD5, nunca sem salt |
| MFA | TOTP desde o dia 1 no papel admin | Comprometer admin = comprometer o tenant |
| Enumeração | Resposta e tempo idênticos para existe/não existe | Vazamento da base de clientes |

**Atraso de claim:** revogar papel no JWT não tem efeito até o token renovar. Se você
remove o admin de alguém, ele continua admin até a expiração. É a razão prática do TTL
curto. Para revogação imediata (demissão, fraude), precisa de checagem em tabela — mais
lenta, use só onde o risco justifica.

---

## 3.8 OWASP Top 10:2025 mapeado no pipeline

| # | Categoria | Fase | Portão |
|---|---|---|---|
| A01 | Broken Access Control (agora inclui SSRF) | F2, F3 | `test:rls` + `test:authz` + `test:idor` |
| A02 | Security Misconfiguration | F7 | headers, CORS, segredos |
| A03 | Software Supply Chain Failures | F6 | `audit` + lockfile + SBOM |
| A04 | Cryptographic Failures | F2 | inventário de campo sensível |
| A05 | Injection | F3 | ORM parametrizado + Opengrep |
| A06 | Insecure Design | **F0/F1** | threat model — não tem teste |
| A07 | Authentication Failures | F3 | `test:auth` |
| A08 | Software/Data Integrity Failures | F7 | assinatura de artefato, CI confiável |
| A09 | Logging and Alerting Failures | F7 | `test:logging` + alerta com limiar |
| A10 | Mishandling of Exceptional Conditions | F3 | teste de caminho de erro |

**Note A06.** É a única sem portão automatizável, e é a que exige *design*. Reforça a
divisão: o que tem portão delega; o que não tem, é seu.

**Mini threat model em F1** — 5 minutos por feature, formato fixo:

```
Ativo:       contatos do CRM (PII de clientes do meu cliente)
Ator hostil: usuário legítimo do tenant B
Superfície:  GET/PATCH/DELETE /contacts/:id
Abuso:       trocar :id por ID de outro tenant
Mitigação:   RLS (banco) + 404 (controller)
Prova:       test:idor#cross-tenant-404
```

Campo **Prova** vazio significa que a mitigação não existe.

---

## 3.9 LGPD — obrigações que viram código

| Obrigação | Implementação | Artefato |
|---|---|---|
| Base legal por finalidade | Mapa dado × finalidade × base legal | `docs/lgpd/inventario.md` |
| Minimização | Não coletar campo sem finalidade declarada | revisão em F1 |
| Direito de acesso | Endpoint de exportação | `GET /me/export` |
| Direito de eliminação | Soft delete + job de hard delete + cascata | job + teste |
| Portabilidade | Export estruturado (JSON/CSV) | mesmo endpoint |
| Retenção | Política por tipo + job de expurgo | job agendado + teste |
| Registro de operações | Trilha de auditoria imutável | tabela append-only |
| Incidente | Runbook de notificação (ANPD + titulares) | `docs/runbooks/incidente.md` |
| Operador vs. controlador | Definido em contrato; **você costuma ser operador** | contrato + DPA |

**Ponto que morde SaaS:** deletar um tenant precisa deletar de verdade — incluindo
backups, réplicas, logs, cache e índice de busca. Desenhe o caminho de eliminação **junto**
com o de criação, em F2. Retrofit é caríssimo.

```sql
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  diff        jsonb,
  ip          inet,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE ON audit_log FROM app_user;   -- estrutural, não convenção
CREATE INDEX ON audit_log (tenant_id, occurred_at DESC);
```

O `REVOKE` é o que diferencia auditoria de log bonito. Sem ele, quem compromete a aplicação
apaga o rastro.

---

## 3.10 Segredos e cadeia de suprimentos

**Segredos:**
- Zero segredo no repositório. `gitleaks` em pre-commit **e** no CI
- `.env.example` versionado com valores falsos; `.env` no `.gitignore` **antes** do primeiro commit
- Rotação com data definida. Segredo sem data de rotação é segredo eterno
- Segredo de produção não passa pela máquina do dev
- Config de MCP e de CI tratadas como `.env`

**Cadeia de suprimentos** (A03:2025, categoria nova e crescendo):
- Lockfile commitado e `--frozen-lockfile` no CI
- `pnpm audit --audit-level=high` bloqueante
- Action de CI fixada por SHA, não por tag mutável
- SBOM gerado no release
- Dependência nova entra por PR com justificativa — inclusive, e principalmente, as que o
  agente sugerir

---

## 3.11 O prompt de auditoria

A versão que circula na internet funciona, mas devolve prosa — não dá para automatizar em
cima disso. Esta produz saída parseável, o que a torna portão de verdade:

```
Você é auditor de segurança de aplicação. Audite este repositório procurando
as 5 falhas mais comuns em código gerado por IA. Não corrija nada nesta passada:
apenas reporte.

ESCOPO — nesta ordem de prioridade:

1. BANCO SEM TRANCA
   - Tabelas sem RLS ou Security Rules
   - Policy com USING mas sem WITH CHECK
   - Função de contexto chamada fora de subquery (reavaliação por linha)
   - Função ou view com SECURITY DEFINER
   - Bucket de storage sem policy
   - Autorização lida de metadado editável pelo usuário
   - Query sem filtro de tenant/dono

2. AUTORIZAÇÃO NO CLIENTE
   - Decisão de permissão em componente de UI sem par no servidor
   - Rota sem middleware de autenticação ou de papel
   - Papel ou permissão vindo do corpo da requisição

3. IDOR / BOLA
   - Busca por ID sem checar tenant e dono
   - 403 onde deveria ser 404 para recurso de outro tenant
   - ID sequencial exposto em rota

4. SEGREDO EXPOSTO
   - Chave em código, bundle ou variável com prefixo público
     (VITE_, NEXT_PUBLIC_, REACT_APP_, EXPO_PUBLIC_)
   - Chave de service role ou credencial de admin fora do servidor
   - Segredo em config de MCP, CI ou Dockerfile
   - .env versionado

5. INPUT SEM TRATAMENTO
   - Schema de entrada sem .strict() (mass assignment)
   - dangerouslySetInnerHTML / innerHTML sem sanitização
   - Upload validado por extensão ou Content-Type em vez de magic bytes
   - SQL cru com interpolação de string
   - Endpoint sensível sem rate limit

FORMATO DE SAÍDA — uma linha por achado, exatamente neste formato:

  SEVERIDADE | arquivo:linha | CATEGORIA | descrição em uma linha | correção em uma linha

SEVERIDADE ∈ {CRITICA, ALTA, MEDIA, BAIXA}
CATEGORIA  ∈ {RLS, AUTHZ, IDOR, SEGREDO, INPUT}

Ordene por severidade decrescente. Ao final, emita apenas:

  TOTAL: <n> | CRITICA: <n> | ALTA: <n> | MEDIA: <n> | BAIXA: <n>

REGRAS:
- Se não tiver certeza, reporte como MEDIA com "verificar manualmente" — não omita.
- Não invente linha. Se não localizar, use arquivo:? e explique.
- Nenhum texto fora do formato acima.
```

Salve como `.claude/skills/auditoria-seguranca/SKILL.md`. Porque a saída tem contagem
estruturada, vira portão: `CRITICA > 0` quebra o build.

---

## 3.12 O portão F6

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "── Controle de acesso (o que scanner não pega)"
pnpm test:rls              # isolamento de tenant, 4 casos
pnpm test:authz            # matriz papel × ação
pnpm test:idor             # todas as rotas com :id
pnpm test:auth             # sessão, rotação, enumeração

echo "── Scanners"
gitleaks detect --source . --redact
opengrep scan --config auto --severity ERROR --error .
[ -d ./python ] && bandit -r ./python -ll

echo "── Higiene"
pnpm test:input            # .strict(), sanitização, upload
pnpm test:logging          # redação de PII
pnpm audit --audit-level=high
pnpm headers:check         # CSP, HSTS, CORS restrito
pnpm bundle:scan           # nenhum padrão de segredo no dist/

echo "F6 OK"
```

Saída binária. Os testes vêm **antes** dos scanners: cobrem A01 e falham mais rápido.

---

## 3.13 Checklist pré-deploy

- [ ] `SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` retorna vazio
- [ ] Toda policy tem `USING` **e** `WITH CHECK`
- [ ] Policies dependem só do schema `app`, nunca de função de plataforma
- [ ] Nenhuma função `SECURITY DEFINER` não auditada
- [ ] Buckets de storage com policy
- [ ] Autorização lida só de metadado não editável pelo usuário
- [ ] Chave de service role não existe em nenhum arquivo do frontend
- [ ] Toda decisão de permissão tem par no servidor
- [ ] Toda rota com `:id` valida tenant **e** dono; outro tenant → 404
- [ ] IDs são UUIDv7/ULID, não sequenciais
- [ ] `gitleaks --log-opts="--all"` limpo; `.env` no `.gitignore` desde o 1º commit
- [ ] Nenhum segredo em config de MCP
- [ ] Schemas de entrada com `.strict()`
- [ ] Upload valida magic bytes, limita tamanho, renomeia, domínio separado
- [ ] Rate limit em login, reset, OTP e endpoints com custo de IA
- [ ] ZAP baseline rodado contra staging
- [ ] Log de produção sem PII em claro

---

**A frase que eu manteria, ajustada:** a IA não deixou essas portas abertas de sacanagem —
ela fez o que você pediu, e ninguém pede "e deixa trancado". Mas a conclusão não é "lembre
de colocar segurança no prompt". Lembrar é probabilístico, e você vai esquecer numa
sexta-feira às 19h. A conclusão é: **segurança é o requisito que mais precisa virar portão,
exatamente porque é o único sem feedback visual.**
# PARTE 4 — Backend: anatomia de uma feature

## 4.1 Estrutura de diretório — vertical, não horizontal

```
apps/api/src/
├── modules/
│   └── contacts/
│       ├── contacts.controller.ts
│       ├── contacts.service.ts
│       ├── contacts.repository.ts
│       ├── contacts.errors.ts
│       ├── contacts.service.spec.ts
│       └── contacts.e2e.spec.ts
├── shared/
│   ├── db/            withTenant, pool, tipos de transação
│   ├── errors/        AppError e mapeamento → HTTP
│   ├── auth/          middleware de sessão e papel
│   └── observability/ logger, métricas, tracing
```

**Corte vertical por domínio**, não horizontal por camada (`controllers/`, `services/`).
Motivo prático e mensurável: numa feature, um corte vertical toca 1 pasta; um corte
horizontal toca N. Menos superfície = diff menor = revisão mais barata = contexto menor
para o agente.

## 4.2 Erros de domínio — nunca `throw new Error`

```ts
// shared/errors/app-error.ts
export class AppError extends Error {
  constructor(
    readonly code: string,          // 'CONTACT_NOT_FOUND'
    readonly status: number,        // 404
    message: string,
    readonly meta?: Record<string, unknown>,
  ) { super(message); }
}

// contacts.errors.ts
export const ContactNotFound = (id: string) =>
  new AppError('CONTACT_NOT_FOUND', 404, 'Contato não encontrado', { id });

export const ContactEmailTaken = (email: string) =>
  new AppError('CONTACT_EMAIL_TAKEN', 409, 'E-mail já cadastrado', { email });
```

Por quê: o service devolve erro de **domínio**, não HTTP. Um único mapeador na borda
traduz para HTTP. Isso é o que mantém o service chamável de fila e CLI (o teste de fumaça
da modularidade da F3).

## 4.3 Sobre estruturas de dados no dia a dia

O ponto do vídeo sobre fundamentos aparece aqui, de forma concreta e mensurável:

```ts
// O(n·m) — o padrão que aparece sozinho quando ninguém está olhando
const enriched = contacts.map((c) => ({
  ...c,
  owner: users.find((u) => u.id === c.ownerId),      // varredura por item
}));

// O(n+m)
const byId = new Map(users.map((u) => [u.id, u]));
const enriched = contacts.map((c) => ({ ...c, owner: byId.get(c.ownerId) }));
```

Com 5.000 contatos e 500 usuários: 2.500.000 comparações vs. 5.500. Em memória, no
event loop, bloqueando todo mundo.

**Isto é exatamente o tipo de coisa que um agente gera sem hesitar** — o primeiro código
funciona, passa no teste e é sutilmente errado em escala. Por isso o subagente revisor tem
"complexidade acidental" como item de prioridade alta, e por isso a fase de revisão não
é opcional. O portão pega correção; ele não pega complexidade.

Corolário para o desenho do seu harness: **crie um teste de carga mínimo para as rotas de
listagem.** Aí a complexidade também vira portão.

---

# PARTE 5 — Frontend: anatomia de uma feature

## 5.1 Camadas

```
apps/web/src/features/contacts/
├── api/           queries e mutations — tipadas por packages/contracts
├── model/         estado de cliente, derivações, máquinas de estado
├── ui/            componentes de apresentação — sem fetch, sem regra
├── routes/        composição + boundaries (loading, error, empty)
└── __tests__/
```

## 5.2 A separação que mais importa: server state × client state

| | Server state | Client state |
|---|---|---|
| Fonte da verdade | Backend | Navegador |
| Exemplos | lista de contatos, perfil | filtro aberto, aba ativa, rascunho |
| Ferramenta | TanStack Query / SWR | `useState`, store leve |
| Precisa de cache/invalidação | Sim | Não |
| Pode ficar stale | Sim | Não |

Misturar os dois (jogar resposta de API dentro de store global de cliente) é a origem de
boa parte dos bugs "a tela não atualizou". São problemas de natureza diferente e merecem
mecanismos diferentes.

## 5.3 Os quatro estados obrigatórios

Toda tela que busca dado tem quatro estados. Especifique os quatro em F1, ou o agente
implementa só o primeiro:

```
1. loading   — skeleton, não spinner centralizado
2. empty     — com ação de saída ("criar primeiro contato")
3. error     — com retry e mensagem que o usuário entende
4. success   — o caso que todo mundo lembra
```

**Portão:** teste que renderiza os quatro. Barato, e elimina uma classe inteira de
retrabalho.

## 5.4 Acessibilidade e performance como orçamento

Não como "boa prática" — como número que quebra o build:

```jsonc
// size-limit
[{ "path": "dist/assets/index-*.js", "limit": "180 kB" }]
```

```bash
pnpm test:a11y     # axe: zero violação serious/critical
pnpm lhci autorun  # Lighthouse: performance ≥ 90, a11y ≥ 95
```

Orçamento que não quebra o build é sugestão. Sugestão erode.

---

# PARTE 6 — Fluxo de trabalho e versionamento

```
main       ──●────────────────────●──────────────  (produção, sempre deployável)
              ╲                  ╱
develop    ────●────●────●──────●───────────────   (integração)
                ╲   ╲    ╲
feature/    ─────●   ●    ●                        (1 feature vertical = 1 branch)
```

**Mapeamento fase → git:**

| Fase | Onde vive | Commit |
|---|---|---|
| F0 | PR só de docs em `develop` | `docs: modelo de domínio de contatos` |
| F1 | PR de spec + contrato | `feat(contracts): schema de contatos` |
| F2 | PR de migration (**sozinho**, sem código de app) | `feat(db): tabela contacts + RLS` |
| F3/F4 | `feature/contacts-crud` | `feat(contacts): CRUD com isolamento` |
| F5/F6 | mesma branch, commits separados | `test(contacts): e2e + isolamento` |
| F7 | merge em `main` + tag | `chore(release): v0.4.0` |

**Migration em PR separado** é regra, não estilo: ela tem perfil de risco e de rollback
diferente do código de aplicação. Misturar os dois no mesmo PR significa que reverter o
código reverte (ou não reverte) o banco de forma imprevisível.

**Tamanho de PR:** teto rígido. Acima de ~400 linhas de diff, a qualidade da revisão
humana despenca. Com agente gerando código, esse teto vira o gargalo real do seu
processo — e é por isso que ele entra como item 6 do portão de verificação.

---

# PARTE 7 — Matriz de delegabilidade (a ponte para os agentes)

Leia da esquerda para a direita: **só existe agente onde existe portão.**

| Fase | Artefato de saída | Portão executável | Nível | Agente candidato | Primitiva |
|---|---|---|---|---|---|
| F0 Domínio | glossário, modelo, ADR | — (revisão) | **D0** | `intake` (só pergunta) | Skill |
| F1 Spec | spec.md, contrato Zod, AC | `typecheck` + snapshot | **D1** | `spec-writer` | Skill |
| F1 Threat model | mini threat model | — (revisão) | **D0** | — | — |
| F2 Migration | SQL + RLS + seed | `db:migrate:test`, `test:rls` | **D1** | `schema-architect` | Skill + hook de bloqueio |
| F3 Backend | repo/service/controller | `test`, `typecheck`, `lint` | **D2** | `backend-implementer` | `/goal` + skill |
| F4 Frontend | data/state/ui/rota | `test`, `test:a11y`, `size-limit` | **D2** | `frontend-implementer` | `/goal` + skill |
| F5 E2E | suíte E2E + contrato | `test:e2e`, `test:contract` | **D2** | `e2e-writer` | Skill |
| F6 Segurança | relatório binário | script F6 | **D2** | `auditoria-seguranca` | Skill + subagente |
| Revisão | comentários no diff | — (parecer) | **D2** | `revisor` | Subagente isolado |
| F7 Release | changelog, tag, dashboards | `release:dry-run` | **D2** | `release-manager` | Skill |
| F8 Triagem | issue classificada, PR | portão da fase original | **D3** | `triager` | `/schedule` |
| F8 Deps | PR de atualização | suíte completa | **D3** | `dependabot-agent` | `/schedule` |

Onde a coluna "Portão" está vazia, o nível é D0. Não é coincidência — é o critério.
**Você não decide o que delegar; o portão decide.**

**Ordem de construção** (maior retorno primeiro):

1. `verificar-feature` (skill) — não é agente, é o portão. **Vem antes de tudo.**
2. `intake` (skill + hook) — o que impede o agente de supor o que você não disse
3. `revisor` (subagente) — pega o que o portão não pega
4. `backend-implementer` — onde está o volume de horas
5. `e2e-writer` — tradução mecânica dos AC; retorno alto, risco baixo
6. `auditoria-seguranca`
7. `frontend-implementer`
8. Os D3 (`triager`, deps) — só depois de 4 semanas de D2 estável

---

# PARTE 8 — Métricas

**Saúde do processo (DORA):**

| Métrica | O que revela |
|---|---|
| Lead time (commit → produção) | Velocidade real, não percebida |
| Frequência de deploy | Tamanho do lote |
| Taxa de falha de mudança | Qualidade dos portões |
| Tempo de restauração | Maturidade operacional |

**Saúde do harness:**

| Métrica | Como coletar | Sinal de alarme |
|---|---|---|
| Custo (tokens/R$) por feature | `/usage`, `/goal` | Subindo sem ganho de escopo |
| Turnos até o portão verde | `/goal` | Média > 6 → spec ruim ou portão frouxo |
| Taxa de retrabalho | % PRs de agente com correção manual | > 30% → volte ao D1 |
| Achados do revisor por PR | contagem | Subindo → regra faltando, codifique |
| Portões que nunca falharam | inspeção | Portão frouxo ou redundante |
| `SUPOSIÇÃO:` corrigidas no review | contagem por fase | Alta numa fase → falta pergunta no intake |

**A penúltima é a mais reveladora.** Portão que nunca reprova nada não é portão — é teatro
que custa tempo de CI. Ou aperte o critério, ou remova.

**A última fecha o ciclo com a Parte 11:** se você corrige a mesma suposição toda semana,
aquela decisão deveria ser pergunta, não default.

**Cuidado com métrica única:** otimizar lead time isolado produz PR grande com portão
frouxo. Leia sempre junto com taxa de falha de mudança. As duas juntas são incontornáveis;
cada uma sozinha é enganável.

---

# PARTE 9 — Ordem de implantação

**Fase A — Fundação e o que já pode estar sangrando (1 semana)**
- [ ] `SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` — **hoje**
- [ ] `gitleaks detect --source . --log-opts="--all"` — **hoje**. Achou, rotaciona
- [ ] `CLAUDE.md` com stack, comandos, layout, convenções
- [ ] Um comando único de portão: `pnpm verify` = `typecheck && lint && test`
- [ ] `.env.example` + `.env` no `.gitignore` + gitleaks no pre-commit
- [ ] ADR da estratégia de isolamento de tenant

**Fase B — O portão que importa (1 semana)**
- [ ] Schema `app` com as funções de contexto, antes da primeira policy
- [ ] RLS + `FORCE` + `USING`/`WITH CHECK` nas tabelas existentes
- [ ] `test:rls` com os quatro casos
- [ ] Gerador que cria esses quatro testes para toda tabela nova
- [ ] `test:authz` e `test:idor` — os dois que nenhum scanner substitui

**Fase C — Formato de trabalho (1 semana)**
- [ ] Template de spec com Given/When/Then
- [ ] `packages/contracts` como fonte da verdade, com `.strict()`
- [ ] Teste de contrato nas rotas existentes
- [ ] Opengrep no CI

**Fase D — Aí sim, agentes (semanas 4+)**
- [ ] Skill `verificar-feature`
- [ ] Skill `intake` + hook `exige-intake`
- [ ] Subagente `revisor`
- [ ] Primeiro `/goal` numa feature real, pequena

> **Se você tiver tempo para só uma coisa: Fase B.** É o que transforma "não posso deixar
> um agente escrever query" em "posso, porque o pior caso é teste vermelho".

---

# PARTE 10 — Checklist de prontidão

Seu pipeline está agent-ready quando responder **sim** a todas:

- [ ] Consigo rodar **um** comando que diz se a feature está pronta?
- [ ] Esse comando tem saída binária, sem interpretação?
- [ ] Todo artefato de fase está no `git`?
- [ ] Um vazamento cross-tenant é impedido pelo **banco**, não pela disciplina do código?
- [ ] Meus critérios de aceite viram teste sem tradução?
- [ ] O contrato entre frontend e backend é um arquivo, não um acordo verbal?
- [ ] Existe um teto de tamanho de PR que o CI aplica?
- [ ] O agente sabe **quais** perguntas fazer antes de codar, sem depender de sentir dúvida?
- [ ] Toda decisão que ele tomou sozinho aparece marcada como `SUPOSIÇÃO:` no artefato?
- [ ] Sei quanto custou (tempo e R$) a última feature?
- [ ] Todo incidente dos últimos 30 dias virou teste, regra ou hook?
- [ ] Consigo apagar um tenant por completo e provar isso com teste?

Cada "não" é uma fase que continua D0 até você resolver.

---

# PARTE 11 — O sistema de intake

Os inventários de 5 perguntas espalhados pela Parte 2 só funcionam com o mecanismo desta
parte. Sem ele, o agente lê "pergunte se tiver dúvida" e não pergunta nada — porque não
sente dúvida.

## 11.1 O princípio

> **Não peça "pergunte quando estiver ambíguo". Entregue o inventário de perguntas.**

O agente não detecta a própria ambiguidade. É o achado do estudo de Stanford aplicado ao
processo: quem usa IA escreve código menos seguro **e acredita mais** que está seguro.
Ausência de dúvida não é sinal de clareza.

Por isso o inventário é fixo e curto. Ele não julga *se* deve perguntar — preenche um
formulário de 5 campos.

**O critério das 5:** entram as perguntas cuja suposição errada custa refatoração. Tudo o
mais o agente decide sozinho e **declara** como `SUPOSIÇÃO:`. A declaração é o que torna
seguro deixá-lo decidir: ele decide, mas visivelmente, e você corrige no review em vez de
descobrir em produção.

## 11.2 A skill

`.claude/skills/intake/SKILL.md`:

```markdown
---
name: intake
description: Levantamento obrigatório antes de implementar. Use sempre antes de escrever código de feature sem spec.
---

# Intake — alinhamento antes de executar

Antes de escrever qualquer linha de código de feature nova, produza
`docs/specs/<feature>/intake.md`.

## Como perguntar

- **Máximo 5 perguntas, uma rodada por fase.** Agrupe, não interrogue.
- Sempre ofereça o default recomendado com a justificativa.
  "Vou assumir X porque Y — confirma?" é melhor que "o que você quer aqui?".
- Se a resposta é inferível do repositório (stack, convenção, padrão já usado),
  **não pergunte**. Declare como `SUPOSIÇÃO:` e siga.
- Pergunte só o que, se errado, custa refatoração. O resto você decide e declara.

## Inventário

Use o inventário da fase correspondente no blueprint (Parte 2). Cada fase tem
exatamente 5 perguntas e uma coluna de default.

## Saída

`docs/specs/<feature>/intake.md` com:
- respostas às perguntas que foram feitas
- `SUPOSIÇÃO:` para cada decisão tomada sem perguntar
- `PENDENTE:` para o que ficou sem resposta

Se houver `PENDENTE:` num item marcado como bloqueante na fase, **PARE**.
Esses itens não têm portão automático — a resposta humana é o portão.
```

## 11.3 O hook

A skill ainda depende do agente decidir invocá-la. O hook não.

`.claude/hooks/exige-intake.sh`, registrado em `PreToolUse` com matcher `Write|Edit`:

```bash
#!/usr/bin/env bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$FILE" in
  *"/docs/"*|*"/.claude/"*|*.md) exit 0 ;;   # docs e config passam
  apps/*|packages/*) ;;                       # código de aplicação é barrado
  *) exit 0 ;;
esac

BRANCH=$(git branch --show-current)
FEATURE="${BRANCH#feature/}"
[ "$BRANCH" = "$FEATURE" ] && exit 0          # não é branch de feature

INTAKE="docs/specs/$FEATURE/intake.md"

if [ ! -f "$INTAKE" ]; then
  echo "BLOQUEADO: $INTAKE não existe. Rode /intake antes de implementar." >&2
  exit 2
fi

if grep -q "^PENDENTE:" "$INTAKE"; then
  echo "BLOQUEADO: itens PENDENTE no intake. Alinhe antes de codar." >&2
  grep -n "^PENDENTE:" "$INTAKE" >&2
  exit 2
fi
exit 0
```

`exit 2` bloqueia a chamada e devolve o `stderr` para o contexto do agente — ele lê o
motivo e vai fazer o intake. Não consegue argumentar contra: o hook roda fora do contexto
dele.

## 11.4 Calibração

**Perguntar demais mata o valor.** Com 15 perguntas você para de ler e responde "sim" em
bloco — o pior cenário: consentimento sem leitura, mas agora com um artefato que *parece*
alinhamento. O teto de 5 é regra, não sugestão.

**O inventário encolhe com o tempo.** Pergunta que sempre recebe a mesma resposta não é
pergunta, é fato:

```
Mesma resposta 5 vezes  →  vira linha no CLAUDE.md  →  sai do inventário
Incidente na F8         →  vira pergunta nova       →  entra no inventário
```

É o loop da F8 aplicado ao próprio intake. Um inventário que nunca muda é um inventário que
não está aprendendo com a sua realidade.

**Não pergunte o que dá para ler.** Se o repositório usa Zod em todo controller, perguntar
"qual validador?" queima orçamento de atenção que você precisava para a pergunta sobre
isolamento de dado.

## 11.5 Resumo do que bloqueia

| Fase | Bloqueia? | O quê |
|---|---|---|
| F0 | ✅ Todas as 5 | Erro é irreversível, nenhuma tem default |
| F1 | ✅ Perguntas 1 e 2 | Controle de acesso — sem portão que pegue depois |
| F2 | ✅ Pergunta 5 | Só quando a migration for destrutiva |
| F3 | ❌ | Portão forte cobre |
| F4 | ❌ | Feedback visual imediato |
| F5 | ❌ | — |
| F6 | ✅ Pergunta 4 | Segredo com prefixo público já nasce publicado |
| F7 | ❌ | — |
| F8 | ❌ | Roda depois do incidente |

**Nove bloqueios em quarenta e cinco perguntas.** O resto é o agente decidindo e
declarando. Isso é proposital: intake que bloqueia em tudo vira burocracia, e burocracia
você contorna — inclusive a sua própria.

---

# PARTE 12 — Portões: o dicionário, os tiers, os tetos

A Parte 0.2 exige que toda fase tenha portão executável. A Parte 7 lista portões numa coluna.
Nenhuma das duas diz **quais existem**, como se chamam e quanto tempo cada um pode custar
antes de deixar de ser rodado. Esta parte é essa lista, e ela é **fechada**: as outras partes
e os quatro arquivos de perfil citam nomes daqui e nenhuma redefine nenhum. Um portão que
você precisa e que não está aqui **entra aqui primeiro**, e só depois é usado.

## Roteiro de leitura

12.1 a 12.5 valem para os quatro perfis; a coluna do seu perfil em 12.2 diz quais linhas você não
tem. 12.6 e 12.7 entram na primeira revisão de processo, não na primeira semana.

---

## 12.1 O nome é a interface, o comando é a implementação

`verify`, `test:rls`, `size:check` são **nomes**. `vitest run`, `tsc --noEmit`, `size-limit`
são implementação. A coluna "Portão executável" da Parte 7 é uma lista de nomes, nunca de
binários, e é isso que torna a skill `verificar-feature` a mesma nos quatro perfis. Três
prefixos, sem exceção — a regra existe para você prever o nome de um portão que ainda não leu.

| Prefixo | Significa | Roda contra | Exemplo |
|---|---|---|---|
| `test:*` | Executa código do projeto e afirma comportamento | Código-fonte, banco de teste | `test:rls`, `test:authz` |
| `<coisa>:check` | Verifica um artefato ou ambiente que já existe | `dist/`, URL, config, git | `headers:check`, `links:check` |
| `<coisa>:<verbo>` | Ação que produz ou transforma algo | Qualquer | `db:migrate`, `release:dry-run` |

> **Regra dura: o agente, o hook e o CI só conhecem nomes de portão. Trocar de stack é
> editar o `package.json` — nunca o harness, nunca o hook, nunca o workflow.**

**Corolário: um nome que não se aplica ao seu perfil existe mesmo assim.** `pnpm test:rls`
num SITE responde e sai com `0`, imprimindo uma linha que aponta para a ADR que justifica.

```jsonc
// package.json — sem aspas simples: cmd.exe não as interpreta (dicionário §5)
"test:rls": "node -e \"console.log('NAO SE APLICA - perfil SITE, ver docs/adr/0007-perfil.md')\""
```

Custo: uma linha e uma ADR. Retorno: `script not found` deixa de ser indistinguível de setup
quebrado — o agente trata os dois igual e sai com `1`, e você caça um problema que não existe.

---

## 12.2 Os portões, por nome

`SI` SITE · `AP` APP · `SA` SAAS · `CR` CRM. ✅ obrigatório · ⚠️ condicional, a condição está na nota · — não se aplica.

### (a) Correção e forma

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `typecheck` | Zero erro de tipo | ⚠️¹ | ✅ | ✅ | ✅ |
| `lint` | Zero warning novo | ✅ | ✅ | ✅ | ✅ |
| `test` | Suíte unitária + integração verde | ⚠️¹ | ✅ | ✅ | ✅ |
| `build` | Compila | ✅ | ✅ | ✅ | ✅ |

¹ SITE sem TypeScript e sem lógica própria pula os dois. Se existe um `.ts` ou um `if`, não pula.

### (b) Controle de acesso — a classe que nenhum scanner pega

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `test:authz` | Matriz papel × ação devolve o status esperado | — | ✅ | ✅ | ✅ |
| `test:idor` | Recurso de outro dono responde 404, não 403 | — | ✅ | ✅ | ✅ |
| `test:rls` | Isolamento no banco: lê, grava, sem contexto, e toda tabela com RLS | — | ⚠️² | ✅ | ✅ |
| `test:auth` | Sessão, rotação de refresh, enumeração de usuário | — | ✅ | ✅ | ✅ |

² APP só tem `test:rls` se usar BaaS com acesso direto do cliente ao banco (Parte 3.1). Com
API própria na frente, o portão de isolamento é `test:authz` + `test:idor`.

### (c) O dado que entra, o dado que sai, e o que o usuário vê

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `test:input` | Schema `.strict()`, sanitização de saída, upload por magic bytes | ⚠️³ | ✅ | ✅ | ✅ |
| `test:contract` | Resposta real da API satisfaz o schema | — | ✅ | ✅ | ✅ |
| `test:e2e` | Fluxo crítico funciona contra a aplicação de verdade | ⚠️⁵ | ✅ | ✅ | ✅ |
| `test:logging` | Nenhum campo PII em log | — | ✅ | ✅ | ✅ |
| `test:erasure` | Eliminação de titular apaga de verdade — inclusive backup, réplica, cache e índice | — | ⚠️⁴ | ⚠️⁴ | ✅ |
| `test:import` | Importação em massa: linha inválida, tamanho, CSV injection | — | — | — | ✅ |
| `test:dedupe` | Merge por chave determinística; heurística sugere e para | — | — | — | ✅ |
| `test:read-audit` | Leitura de dado de terceiro deixa rastro | — | — | — | ✅ |
| `test:a11y` | axe: zero violação serious/critical | ✅ | ✅ | ✅ | ✅ |
| `size:check` | Orçamento de bundle não estourado | ✅ | ✅ | ⚠️ | ⚠️ |
| `test:meta` | `<title>`, description, canonical, OG por rota | ✅ | ⚠️ | — | — |
| `links:check` | Nenhum link interno quebrado no build | ✅ | ⚠️ | — | — |
| `lh:check` | Lighthouse acima do limiar declarado | ✅ | ⚠️ | — | — |

³ SITE só tem `test:input` se tiver formulário. Sem formulário, não há entrada.
⁴ Obrigatório assim que houver dado pessoal, independente do perfil.
⁵ SITE só tem `test:e2e` com fluxo de mais de um passo — formulário com confirmação, carrinho,
checkout. Página que só apresenta conteúdo já é coberta por `links:check` e `test:meta`.

### (d) Segredo, plataforma e o próprio processo

| Nome | O que prova | SI | AP | SA | CR |
|---|---|:--:|:--:|:--:|:--:|
| `secrets:scan` | Nenhum segredo na árvore de trabalho | ✅ | ✅ | ✅ | ✅ |
| `secrets:scan:full` | Nenhum segredo no histórico inteiro | ✅ | ✅ | ✅ | ✅ |
| `bundle:scan` | Nenhum segredo no artefato publicado | ✅ | ✅ | ✅ | ✅ |
| `deps:check` | Nenhuma vulnerabilidade alta em dependência de produção | ✅ | ✅ | ✅ | ✅ |
| `sast` | Análise estática sem erro | ⚠️ | ✅ | ✅ | ✅ |
| `headers:check` | CSP, HSTS e demais cabeçalhos, **contra URL publicada** | ✅ | ✅ | ✅ | ✅ |
| `profile:check` | O perfil declarado ainda corresponde ao código | ✅ | ✅ | ✅ | ✅ |
| `tree:check` | Árvore de trabalho limpa: nada modificado, nada em stage, nada solto | ✅ | ✅ | ✅ | ✅ |
| `pr:check` | Diff dentro do teto de linhas | ✅ | ✅ | ✅ | ✅ |
| `hooks:check` | Todo hook responde certo nos três casos, inclusive stdin `null` | ✅ | ✅ | ✅ | ✅ |
| `cost:check` | Custo da feature dentro do orçamento declarado | ⚠️⁶ | ⚠️⁶ | ⚠️⁶ | ⚠️⁶ |

⁶ Nome reservado, **sem script em `scripts/`** (dicionário §2.7): custo por feature é **D1** (12.7).

Quatro já são executáveis e medidos no Windows — `scripts/profile-check.mjs`,
`scripts/tree-check.mjs`, `scripts/hooks-check.mjs`, `scripts/headers-check.mjs`; o índice está
em `scripts/README.md`.
E `profile:check` **não classifica**: classificar é o procedimento de três perguntas da Parte
0.4, respondido uma vez e gravado em `.perfil`. O script só detecta sinal de perfil
**superior** ao declarado, porque o ajuste de perfil é de mão única.

---

## 12.3 Os cinco tiers e os tetos

| Tier | Nome | Teto | O que entra |
|---|---|---|---|
| 1 | pre-commit | **5 s** | `lint` no que mudou, `secrets:scan --staged` |
| 2 | `verify` (local, push) | **90 s** | A corrente de 12.4. Nada de navegador, banco ou rede |
| 3 | `verify:ci` | **10 min** | `test:rls`, `test:contract`, `test:a11y`, `lh:check`, `sast`, `deps:check` |
| 4 | `verify:deploy` | livre | `headers:check`, `test:e2e` contra preview |
| 5 | noturno | livre | `secrets:scan:full`, DAST, canários de portão |

> **Regra dura: `verify` local acima de 120 s muda de tier no mesmo dia.** Não entra na
> lista de "otimizar depois".

**Armadilha: o portão lento.** Um `verify` de 8 minutos não é um portão rigoroso — é um portão
desligado. **Calibre com 12 execuções por dia útil até medir as suas.** 8 min × 12 = 96 minutos de
espera diária, e a degradação é sempre nesta ordem: você para de rodar antes do commit e
"deixa o CI dizer" → o vermelho do CI chega 10 minutos depois do seu foco ter mudado e vira
ruído → `--no-verify` entra no músculo → o portão existe no repositório e não existe no
processo. **Portão local não compete com o CI. Compete com não rodar nada.** Troque o 12 pelo
seu número — os dois lados da conta são mensuráveis no seu ambiente:

```powershell
Measure-Command { pnpm verify }                     # o tempo real, não o estimado
(git log --since=14.days --oneline).Count / 10      # commits/dia útil = o piso das execuções
```

Piso, não número: você roda `verify` mais vezes do que comita. Se o produto passar de 90 s, o
corte não é otimização — banco e navegador vão para o tier 3, ambiente no ar vai para o 4 ou
o 5. **Teto não negocia com escopo; escopo é que muda de tier.**

**Os portões de processo têm tier declarado** (dicionário §2.7): `profile:check` e `tree:check` são
tier 2; `pr:check` e `hooks:check`, tier 3; `cost:check` tem o tier 3 reservado e nenhum script, e
até existir o número é lido por você (12.7). `hooks:check` foi medido nesta máquina em **2,2 s para
os 53 casos** — mediana de sete execuções, método em `scripts/README.md` —, caberia nos 90 s do
tier 2 e fica no 3 porque o custo cresce a cada hook novo.

---

## 12.4 `verify`: uma definição por perfil, e só uma

**`verify` é o tier 2.** Ele é a resposta à pergunta 1 da Parte 10 — o comando único que diz
se a feature está pronta. Tudo que precisa de navegador, banco, rede ou deploy **fica fora
dele**; é para isso que existem os outros quatro tiers. Um bloco, quatro correntes:

```jsonc
{
  "scripts": {
    // ---- SITE ----
    "verify": "pnpm profile:check && pnpm lint && pnpm build && pnpm size:check && pnpm test:meta && pnpm links:check && pnpm bundle:scan",
    // ---- APP / SAAS / CRM: mesma forma, o conteúdo cresce ----
    // APP:  profile:check lint typecheck test build size:check test:authz test:idor bundle:scan
    // SAAS: idem APP + test:input test:logging
    // CRM:  idem SAAS + test:dedupe
  }
}
```

A espinha é a mesma nos quatro: **`profile:check` primeiro** — o mais barato, e invalida tudo
se falhar —, depois forma (`lint`, `typecheck`, `test`), depois `build`, depois o que consome
`dist/` (`size:check`, `bundle:scan`, `test:meta`, `links:check`). Ordem errada não muda o
resultado; muda o tempo até você saber o resultado. Dois critérios de
desempate: **dependência real manda** (`size:check` só existe depois do `build`) e **melhor
diagnóstico primeiro** — `typecheck` diz "`Contact` não é atribuível a `CreateContactInput`
em contacts.service.ts:42"; o mesmo defeito, visto pelo runner de testes, é `TypeError:
Cannot read properties of undefined` três camadas abaixo. **Local falha rápido; CI falha
inteiro:** no terminal você quer o primeiro erro e o prompt de volta, daí o `&&`; no CI,
`fail-fast: false`, porque cada ida e volta custa o ciclo todo.

**Armadilha: o `&&` que você digita não é o `&&` do `package.json`.** Dentro do valor do
script ele funciona porque `pnpm` invoca o `cmd.exe`; digitado direto no PowerShell 5.1 é
erro de sintaxe. No seu terminal chame `pnpm verify`, nunca a corrente à mão.

---

## 12.5 Por que `headers:check` nunca entra em `verify`

Cabeçalho de resposta não está no `dist/`: ele vem do `vercel.json`, aplicado no deploy.
Rodar `headers:check` antes de existir URL é teatro — ou reprova sempre, ou passa sem medir
nada. **Um portão que nasce vermelho é um portão que se aprende a pular.** Por isso ele é
tier 4, contra a URL de preview do PR:

```powershell
node scripts/headers-check.mjs https://sua-preview.vercel.app   # ou via DEPLOY_URL
```

Sem URL o script sai com `1` em vez de passar em branco. Ele afirma CSP, HSTS,
`X-Content-Type-Options` e `Referrer-Policy`; a CSP em si é decisão de arquitetura (Parte 3.5)
e continua **D1** — o script confere que ela chegou ao ar, não que ela é a certa.

**A mesma regra vale para todo portão que dependa de rede.** Link interno é determinístico e
roda offline: `links:check`, tier 2. Link externo depende de servidor de terceiro — a
definição de flaky, e a Parte 2 (F5, pergunta 5) já fixou que flaky é zero.

---

## 12.6 O portão que nunca reprova

A Parte 8 lista "portões que nunca falharam" como sinal de alarme e conclui: ou aperte o
critério, ou remova. Isso é diagnóstico. O mecanismo que separa os casos é o **canário de
portão** — você injeta de propósito o defeito que o portão existe para pegar e confirma que ele
fica vermelho. Teste de mutação à mão, um por portão, no tier 5. Porque zero reprovações
admite quatro leituras, e três exigem ação diferente:

| Situação | Diagnóstico | Ação |
|---|---|---|
| Canário aplicado, o portão **passou** | Teatro | Aperte o critério; se não der, remova |
| Canário aplicado, o portão **reprovou** | Portão bom, risco raro | Mantenha e mova para tier mais lento |
| Um hook tornou a classe de falha impossível | Sucesso estrutural | Remova o portão, **nunca** o hook, e registre em ADR |
| Não existe canário escrito | Não auditável | Escreva o canário antes de discutir o resto |

> **Regra dura: agente pode acrescentar portão; remover portão é D0, sai por PR seu, com
> ADR.** Um agente que vê `test:rls` reprovando tem duas saídas — consertar o código ou
> afrouxar o portão — e a segunda é mais barata.

Auditoria de portões é **D0** — revisão humana, sem portão automático. Custo honesto: canário
apodrece. Vale porque "não aplica mais" é sinal útil: mexeram na região que o portão vigia.

---

## 12.7 Custo por feature: o que dá para medir, e o que ainda é leitura sua

A Parte 8 mede custo por feature e não trava nada. A Parte 5.4 já explicou por que isso não se
sustenta: **orçamento que não quebra o build é sugestão, e sugestão erode.** Vale igual para
token — custo que só aparece na fatura um mês depois, sem atribuição por feature, é custo que
você racionaliza mês a mês. Só que trava aqui ainda não existe: `cost:check` é nome reservado
sem script, então **medir custo por feature é D1** — o número é produzido, a decisão é sua.
Seja exato sobre a fronteira:

| Parte | O que é | Nível |
|---|---|---|
| Somar tokens de um transcript e comparar com um teto | Determinístico. Os arquivos estão no disco | **D2** — o comando decide |
| Ponderar entrada, saída, escrita e leitura de cache | Determinístico, **desde que os fatores venham da tabela vigente do fornecedor** | D2 |
| Dizer **quais** transcripts pertencem a esta feature | Depende de você manter o manifesto | **D1** — humano no loop |
| O valor do teto por classe de feature | Escolha sua, calibrada com o seu histórico | **D0** |
| Decidir o que fazer com estouro recorrente | Orçamento errado, feature grande demais ou custo aceito | **D0** |

O teto não vem de fora; o documento fixa só o método: **junte 10 features da mesma classe e use
mediana × 1,5** — a margem é sua, calibre-a. Discutir o número antes das 10 medições é discutir
opinião com aparência de dado. Ao estourar, exija de si mesmo exatamente um artefato: uma linha em
`docs/specs/<feature>/custo.md` respondendo **qual pergunta de intake teria evitado** (Parte 2,
F8, pergunta 5). Estouro raramente significa "a feature era cara" — significa que o loop girou
sem alvo, o mesmo diagnóstico da métrica de turnos até o verde da Parte 8.

**Armadilha: a válvula de escape que ninguém implementou.** É tentador prometer um `CUSTO_OK:`
no corpo do PR que o portão reconhece e libera. Enquanto nenhum script ler o corpo do PR, essa
válvula não existe — e portão com escape imaginário reprova o caso legítimo na primeira
semana, o que ensina o time a desligá-lo. Enquanto não houver script nem leitura do PR, o estouro
é **D1**: você lê o número, decide no PR e registra em `custo.md`.

---

## 12.8 Checklist da Parte 12

- [ ] Todo portão do seu perfil tem nome desta parte no `package.json`; nenhuma skill, hook ou workflow chama binário direto; e o nome que não se aplica existe, sai com `0` e aponta para uma ADR
- [ ] `.perfil` está versionado na raiz e `profile:check` é o primeiro elo de `verify`
- [ ] `Measure-Command { pnpm verify }` devolve menos de 90 s — medido, não estimado — e nada que precise de banco, navegador ou rede está no tier 2
- [ ] `headers:check` roda contra a URL de preview e sai com `1` sem URL; todo hook passa em `hooks:check`, inclusive o caso de stdin `null`
- [ ] Todo portão do `verify` tem canário escrito, e a última auditoria tem menos de 30 dias
- [ ] O teto de custo por feature veio da sua mediana, não de um número que você leu em algum lugar — e, sem script, quem lê o estouro é você

---

# PARTE 13 — Orquestração: quantos agentes, quando, e quem faz commit

A Parte 7 responde *qual* trabalho tem portão e portanto pode ser delegado. Ela não responde
**quantos processos rodam ao mesmo tempo** nem **quem escreve no `git`**. As duas perguntas são
independentes da primeira, e errar as duas custa uma tarde dentro de um pipeline que estava correto.

Vocabulário desta parte, com sentido fixo:

- **Orquestrador** — a sessão principal: planeja, despacha, commita, fecha a onda. Não escreve
  arquivo de aplicação.
- **Implementador** — agente despachado para escrever um conjunto declarado de arquivos. Roda o
  próprio portão, devolve relatório, nunca commita.
- **Onda** — as tarefas despachadas na mesma mensagem, em paralelo, commitadas em sequência pelo
  orquestrador ao final.

## 13.1 Quando multiagente não paga

Comece por aqui. Rodar três agentes não custa três vezes um agente — custa mais, porque cada um
reconstrói do zero o contexto que o vizinho já tem carregado. A ordem de grandeza que aparece em
campo é **múltiplo, não percentual**: algo entre 3 e 10 vezes o mesmo trabalho feito por um agente
só. Não é constante de tabela — é consequência de quanto contexto seu briefing manda cada um reler.

**O número que decide é o seu, e ele é mensurável no seu repositório.** O instrumento é o da Parte 8
— "Custo (tokens/R$) por feature", com `/usage`. Leia `/usage` antes e depois de uma feature típica
feita por um agente só, repita numa feature equivalente despachada como onda de três, e divida. Duas
medições da sua base valem mais que qualquer multiplicador citado de fora; quociente perto de 1 quer
dizer que a onda não carregava briefing nenhum, e quase sempre também não paralelizava nada.

| Situação | Por que não paga |
|---|---|
| "Vou abrir 3 agentes para ir mais rápido", sem `Files:` disjuntos | Você paga 3× o contexto e ainda serializa no fim, porque um espera o outro para não colidir |
| Tarefa que cabe num contexto só, ou fase seguinte da mesma feature | O agente já tem tudo carregado; o segundo processo re-lê o mesmo material do zero (anti-padrão 2 de 13.3) |
| Sem `verificar-feature` e `revisor` de pé | Ordem de construção da Parte 7: onda é item posterior ao 4, nunca anterior |

**Amarração com o custo:** uma onda de 4 tarefas entra no orçamento como **4 orçamentos, não 1**.
Some antes de despachar e compare com `cost:check` (dicionário §2.6). Se a onda estoura o teto, **o
corte é reduzir a onda, não afrouxar o teto** — paralelismo multiplica custo sem você perceber.

**A decisão de abrir uma onda não tem portão automático: é sua, nível D0** — o que se confere
mecanicamente é a *declaração* dela (13.5). **Regra dura: na dúvida, um agente.** Ela só se paga em
três cenários; fora deles, o segundo processo é despesa sem retorno.

## 13.2 Os três cenários em que paga

| Cenário | O que caracteriza | Teste antes de abrir o segundo processo |
|---|---|---|
| **Proteção de contexto** | A tarefa gera lixo intermediário que você não quer no contexto principal: varrer 200 arquivos, ler log grande, triar achados de SAST | A saída útil cabe em ~30 linhas? Se sim, o subagente devolve 30 linhas em vez de despejar a varredura inteira no seu contexto |
| **Paralelização real** | N tarefas com `Files:` totalmente disjuntos, sem dependência entre si, e o tempo de parede importa | Consigo nomear as duas tarefas e listar os arquivos de cada uma em 60 segundos? |
| **Especialização genuína** | O outro processo tem checklist, permissão ou ferramenta *diferente* — o `revisor` da Parte 7 vale porque **não** compartilha o contexto de quem implementou | O valor vem de ele não saber o que o implementador sabe? |

## 13.3 Como decidir a quebra de tarefas

> **Decomponha por fronteira de contexto isolável — o que cada tarefa precisa saber para trabalhar
> sozinha — e não por tipo de problema nem por fase do trabalho.**

O teste operacional é escrever o briefing. Se o briefing da tarefa B precisa explicar uma decisão que
A ainda está tomando, **B e A são uma tarefa só** — é a Regra 3 da Parte 0.2 aplicada a processos
concorrentes: onde não existe artefato pronto entre as duas, não existe fronteira.

| Anti-padrão | Como aparece | Por que quebra |
|---|---|---|
| **1. Centrado no problema** | "um agente pro banco, um pro front, um de segurança" | Divisão temática não corresponde a divisão de arquivo: o agente de segurança precisa editar o mesmo `contacts.controller.ts` que o de backend está escrevendo. E agente que não escreve arquivo nenhum não é implementador — é revisor |
| **2. Sequencial por fase** | plano / implementação / teste como agentes separados | Os três compartilham o mesmo contexto. Quem escreve o teste precisa de tudo que quem implementou decidiu. Você paga a transferência do contexto inteiro duas vezes sem ganhar tempo nenhum — fases são sequenciais por definição |
| **3. Componentes acoplados** | `repository` / `service` / `controller` da mesma feature em três agentes | A ordem de dependência da F3 é `repository → service → controller`. O agente 2 fica bloqueado esperando a forma que o agente 1 ainda não decidiu, e adivinha errado |
| **4. Estado compartilhado mutável** | dois agentes tocando `prisma/schema.prisma`, o registrador de rotas, um arquivo barril, o de i18n ou `pnpm-lock.yaml` | Não há merge: o último a escrever vence, em silêncio. Dois agentes instalando dependência produzem lockfile inconsistente **toda vez** |

`apps/api/src/modules/contacts/**` contra `apps/web/src/features/contacts/**` é fronteira legítima
depois que F1 mergeou o contrato, pelo motivo que a Parte 1 já dá: F3 e F4 paralelizam porque F1
produziu o contrato tipado antes. Já `contacts.service.ts` contra `contacts.controller.ts` não é
fronteira nenhuma, por mais que sejam dois arquivos — o segundo depende da forma que o primeiro
ainda está decidindo. **Armadilha:** achar que arquivos diferentes bastam. Arquivo disjunto é
condição *necessária*, não suficiente; `Depends-on` cobre a outra metade, e por isso os dois campos
existem separados.

## 13.4 A tensão com a Parte 7

A matriz da Parte 7 lista agentes por fase (`spec-writer`, `backend-implementer`,
`e2e-writer`); lida como receita de orquestração, ela vira o anti-padrão 2. **Regra dura: a
Parte 7 nomeia papéis, não processos. Nenhuma linha daquela matriz é autorização de despacho
paralelo.** Um agente cumpre várias linhas dela no mesmo contexto, trocando de skill. As duas
exceções, `revisor` e `auditoria-seguranca`, são processo próprio pelo cenário 3 de 13.2 —
isolamento, não paralelismo, e não disputam arquivo nenhum.

## 13.5 Execução em ondas — o protocolo

Toda tarefa despachável vive num plano versionado, `docs/ondas/<id>.md`, com **cinco campos, nenhum
opcional**. Nome de portão vem do dicionário §2, sempre:

```markdown
## T1 — migration e RLS de contacts
Files:
  prisma/migrations/20260815_contacts/migration.sql
Depends-on: —
Portão: test:rls
Nível: D1
Modelo: padrão

## T2 — repository e service de contatos
Files:
  apps/api/src/modules/contacts/contacts.repository.ts
  apps/api/src/modules/contacts/contacts.service.ts
Depends-on: T1
Portão: typecheck, test
Nível: D2
Modelo: padrão
```

`Files:` são **caminhos exatos**, nunca globs: dois `apps/api/src/modules/**` parecem disjuntos e não são.

> **Duas tarefas só entram na mesma onda se NENHUMA depende da outra — nem transitivamente — E os
> conjuntos de `Files:` são TOTALMENTE disjuntos.**

Ambas as condições, sempre. A onda é um nível topológico do DAG que a Parte 0.2 já descreve:
`Depends-on` são as arestas, `Files:` é o que impede duas arestas paralelas de escreverem no mesmo
nó. **Não existe portão no dicionário para a formação da onda: a conferência das duas condições é
sua, nível D0**, cobrada item a item pelo checklist de 13.10.

**Incerteza vira dependência.** Sem saber se T4 depende de T2, escreva `Depends-on: T1, T2, T3` —
tudo que já foi listado. Errar conservador custa uma onda a mais, minutos de tempo de parede; errar
permissivo custa duas meias-features sobrepostas, sem conflito visível no `git`, descobertas horas
depois por um teste que ninguém entende. **Regra dura: dúvida sobre dependência sempre resolve para
`Depends-on`. Você só perde paralelismo, e paralelismo é o item mais barato desta parte.**

**"Mesmo arquivo" desqualifica mesmo em seções diferentes.** Duas tarefas editando a linha 10 e a
linha 400 do mesmo arquivo não vão na mesma onda. Cada agente lê o arquivo, monta a nova versão a
partir do que leu e grava; o segundo a gravar tinha lido **antes** de o primeiro escrever, e o
resultado é a versão dele, inteira — sem marcador de conflito e sem aviso. **O `git` só protege você
entre commits, e dentro de uma onda nada foi commitado ainda: não existe merge para acontecer.** Na
maior parte das vezes o teste do primeiro agente ainda passa, porque a mudança que sumiu era do
outro, e você descobre no `verify` de fechamento — com quatro tarefas no ar e nenhuma pista de qual
arquivo perdeu o quê.

### O loop por onda

```
1. plano + duas condições   docs/ondas/<id>.md, cinco campos por tarefa · conferido por você, D0
2. árvore limpa             pnpm tree:check                                → exit 0/1
3. despacho                 TODAS as tarefas numa ÚNICA mensagem
4. espera                   sem ler arquivo, sem editar nada
5. commits                  um por tarefa, por lista de caminhos, em ordem (13.6)
6. revisores                despachados juntos, depois, sobre o intervalo do registro
7. fechamento               pnpm verify                                    → exit 0/1
```

**Passo 2 — o portão é `tree:check` (dicionário §2.7), nunca uma corrente digitada.** `git
status --porcelain` sozinho sai com 0 tendo ou não tendo saída: como portão, aprova sempre.
`scripts/tree-check.mjs` lê essa saída em Node, sai 1 assim que existe mudança, e é mais
estrito que o par de `diff --quiet`: arquivo não rastreado também suja a árvore, porque o
passo 5 commita por lista explícita de caminhos.

**Passo 3 — armadilha:** despachar as tarefas em mensagens separadas. Se você manda T2 e espera o
resultado antes de mandar T3, o tempo de parede é serial e você pagou o custo de multiagente (13.1)
sem receber a única coisa que ele vendia. **Todas as tarefas da onda saem na mesma mensagem, ou não
é onda.** E no passo 4 não leia arquivo com a onda no ar: sua leitura é o retrato de um arquivo
sendo escrito, e "corrigir" o que você viu meio pronto introduz um terceiro escritor nele.

**Passo 5:** o orquestrador **não** roda o portão de cada tarefa — a árvore contém trabalho parcial
das outras e ele reprova por motivo alheio. O portão de cada tarefa roda dentro do agente e a última
saída vem no relatório; o da árvore inteira é o `verify` do passo 7, uma vez, com a onda fechada.
**Revisores não entram no plano:** não escrevem arquivo, logo não têm fronteira a declarar e não
colidem com ninguém — único caso em que você despacha N processos sem análise de disjunção.

O briefing de cada tarefa tem cinco blocos: contexto mínimo com caminho exato de cada arquivo a ler
e a instrução de não ler mais que aquilo; a lista fechada de arquivos que pode escrever; o portão,
para rodar até passar; o proibido (`git` em qualquer subcomando, editar fora da lista, instalar
dependência, rodar migration); e o relatório — arquivos escritos, última saída do portão literal,
cada `SUPOSIÇÃO:` tomada. Nenhum hook sabe qual tarefa o subagente que chamou `Write` executa, então
a fronteira não tem portão em tempo de escrita: confere-se no commit (13.6).

Uma onda de 4 tarefas produz um PR com 4 tarefas dentro, e o teto de diff da Parte 6 é **por PR, não
por onda** — quem o mede é `pr:check` (dicionário §2.6). Onda que cabe no teto vira um PR; onda que
estoura vira uma branch por tarefa, a partir do intervalo `antes→depois` do registro. Migration
continua em PR próprio: T1 do exemplo acima é uma onda de uma tarefa só.

## 13.6 Ninguém que implementa faz commit

> **Quem escreve arquivo nunca escreve no índice do `git`. O commit é do orquestrador, sempre, sem
> exceção "só dessa vez".**

**1. Sobrescrita silenciosa.** T2 termina aos 90 s e roda `git add -A && git commit` enquanto T3 está
no meio da escrita do terceiro arquivo dela: o `-A` varre esse arquivo meio escrito para dentro do
commit de T2. O histórico ganha um commit que não compila, atribuído a quem não escreveu aquilo, e
bissecar fica impossível — o commit culpado não é o que introduziu o código.

**2. Disputa de commit.** Dois agentes rodam `git commit` no mesmo segundo. O `git` serializa por
`.git/index.lock` e o perdedor recebe `fatal: Unable to create ... File exists`. No Windows é pior:
processo abortado deixa o `index.lock` para trás e **todo** comando `git` no repositório falha até
alguém apagá-lo à mão. Aí o agente tenta ajudar, apaga o lock e volta a disputar — agora com dois
processos escrevendo no índice sem trava nenhuma.

A exceção "só dessa vez" é pedida exatamente quando três agentes estão no ar e a onda está atrasada:
o único estado em que os dois modos de falha estão simultaneamente vivos. **A única vez que você abre
exceção é a vez em que ela morde.** E a F8 já resolveu a ordem: **teste é reativo, regra é
probabilística, hook é determinístico — escolha sempre o mais baixo que resolva.**

**Aqui o mais baixo não é hook, e o dicionário §5.1 diz por quê.** Um hook de comando não vê
quem chamou: o mesmo `git commit` é proibido para o implementador e obrigatório para o
orquestrador. Barrar `git push` no atacado ainda quebraria `--force-with-lease`, que é a
variante segura e é caso feliz declarado em `hooks:check`. O mecanismo estrutural é
**permissão de ferramenta do subagente** — implementador despachado sem acesso a shell não
roda `git`, ponto. Onde o harness não oferecer essa permissão, a regra é convenção, escrita
no briefing e no `CLAUDE.md` e declarada **D0**, nunca apresentada como trava.

O orquestrador commita **por lista explícita de caminhos, nunca `-A`, nunca `.`** — e só depois de
conferir que nada sujo caiu fora do plano da onda:

```
git add -- apps/api/src/modules/contacts/contacts.repository.ts <...>
git commit -m "feat(contacts): repository + service" -- <os mesmos caminhos>
```

Com `git rev-parse HEAD` imediatamente antes e imediatamente depois, o par `antes→depois` de cada
tarefa vai para um registro versionado ao lado do plano (`docs/ondas/<id>-registro.md`), como manda a
Regra 1 da Parte 0.2: é ele que torna mecânicas as duas saídas de PR de 13.5 e o escopo do revisor.

**Armadilha: capturar o `HEAD` uma vez só no início da onda.** `BASE=$(git rev-parse HEAD)` antes do
primeiro despacho, reusado pela onda inteira, é a forma mais natural de escrever isso e está errada:
depois do primeiro commit, `BASE` deixou de ser o pai de T3 e virou o avô. Três consequências, todas
silenciosas — `git diff "$BASE"..HEAD` na revisão de T3 mostra T2 junto, e o diff estoura o teto da
Parte 6 sem ninguém ter escrito tanta linha; `git revert BASE..HEAD` para "desfazer T3" desfaz T2
também; e o registro aponta a mesma base para todas as tarefas, o que mata a bissecção por tarefa.
**Regra dura: `HEAD` é lido no momento do commit, uma vez por commit, nunca uma vez por onda.** Custa
um spawn de processo — não existe economia que justifique cachear esse valor.

## 13.7 Nível de modelo por despacho

**Nunca herdado.** O default de qualquer harness é o subagente herdar o modelo do pai — e aí um
`rename` de 6 linhas roda no caro porque por acaso você estava nele, e uma decisão de isolamento de
tenant roda no barato porque por acaso você tinha trocado. Por isso `Modelo:` é campo obrigatório.

| Classe de trabalho | Modelo | Por quê | O que protege |
|---|---|---|---|
| Mecânico: renomear, mover arquivo, aplicar *codemod*, traduzir AC Given/When/Then em `it()` | Barato | A resposta é quase determinística e o erro aparece no mesmo minuto | `typecheck`, `test` |
| Implementação, debug, revisão | Padrão | É onde está o volume de horas (F3/F4) e onde o portão já existe | Portão da fase |
| Arquitetura de verdade: modelagem de domínio (F0), isolamento de tenant (Parte 3.1), threat model | Caro | Nenhum portão pega o erro depois | Nada — por isso é D0/D1 e não vai para onda |

O trabalho que justifica modelo caro é justamente o que a Parte 0.3 classifica como D0/D1: **modelo
caro quase nunca aparece dentro de onda**, e sim na sua conversa, antes de a onda existir.

**Turnos importam mais que preço por token.** Um modelo barato que gasta o triplo de turnos sai mais
caro, porque cada turno reenvia o contexto acumulado: o custo do turno N é proporcional ao tamanho
do contexto naquele momento, então o gasto cresce mais rápido que o número de turnos. O instrumento
já existe — **"Turnos até o portão verde", da Parte 8, com alarme em média > 6**. Rode a mesma classe
de tarefa algumas vezes em cada nível antes de fixar o barato como default dela: se ele passa de 6
onde o padrão fica em 3, não é barato ali. **A escolha do nível não tem portão automático — é sua,
nível D0**; o que se confere é a declaração, e tarefa sem `Modelo:` no plano não sai.

## 13.8 Válvula de escape: worktree isolada

Quando uma tarefa precisa tocar um arquivo que outra tarefa da onda também toca e não dá para
esperar a próxima onda, a saída é uma **worktree** — cópia de trabalho adicional do mesmo
repositório, com branch e diretório próprios: `git worktree add C:/wt/t4 -b tarefa/t4`, `pnpm
install` lá dentro, despacho de T4 apontando para `C:/wt/t4`, e `git worktree remove C:/wt/t4` no
fim. **O custo, declarado — não é grátis:**

| Item | Custo |
|---|---|
| `pnpm install` na worktree | Uma execução completa. O store do pnpm é endereçado por conteúdo, então o disco quase não cresce, mas o tempo de link você paga inteiro |
| Servidor de dev | Segunda instância do Vite, segunda porta, e o `.env` precisa ser copiado (não é versionado, Parte 3.10) |
| Caminho no Windows | Use raiz curta e sem espaço (`C:/wt/t4`). O limite de 260 caracteres ainda morde com `node_modules` aninhado |
| Configuração local | `.claude/settings.local.json` e hooks não versionados não vão junto: a worktree nasce **sem** o bloqueio de 13.6 |
| O merge depois | É merge de verdade, com conflito de verdade |

A última linha é o ponto: a worktree **não elimina a colisão, troca a natureza dela**. Você sai de
"sobrescrita silenciosa dentro da onda" para "conflito explícito no merge" — melhora enorme, porque
conflito você vê, mas continua sendo trabalho seu. **Regra dura: worktree serve para isolar uma
colisão inevitável, nunca para comprar paralelismo** — criá-la para rodar mais agentes é sinal de
que a quebra de tarefas está errada. Volte para 13.3.

## 13.9 Como isso muda por perfil

Perfis pelo procedimento do dicionário §4. A pergunta é sempre a mesma: **quantas tarefas com
`Files:` genuinamente disjuntos existem numa feature típica deste perfil?**

| Perfil | Tarefas disjuntas por feature | Onda vale? | O que fazer |
|---|---|---|---|
| **SITE** | ~1 | **Quase nunca** | A feature inteira é página + componente + estilo, e os três se referenciam. Um agente implementando. O que paga aqui é o cenário 1 de 13.2: subagente de leitura (varrer assets, medir bundle) e o `revisor` |
| **APP** | 2, e só depois de F1 mergeado | Marginal | Backend e frontend em paralelo pelo argumento da Parte 1. Abaixo disso, um agente |
| **SAAS** | 2 a 3 | Sim, a partir da segunda entidade | Contrato mergeado, depois onda de backend + frontend + E2E da entidade anterior |
| **CRM** | 3 a 6 | **Sim — é o perfil onde onda paga sozinha** | Módulos verticais por entidade (Parte 4.1) são disjuntos por construção |

O caso do CRM, concreto: `contacts`, `deals` e `companies` são três módulos verticais com diretórios
disjuntos, contra migrations e contratos já mergeados — três tarefas numa onda, três commits, um
`verify` no fim. É ali que o anti-padrão 4 aparece: as três entidades compartilham o registrador de
rotas, o arquivo barril e o de i18n. A solução é geral:

> **Arquivo de registro (rotas, barril, i18n, `pnpm-lock.yaml`) é editado pelo orquestrador, depois
> de a onda fechar, no commit dele. Nunca pelas tarefas.**

São poucas linhas por entidade: o orquestrador escreve todas de uma vez, enquanto distribuí-las entre
três agentes custa um lockfile quebrado e uma hora de investigação. **Regra dura: se você não
consegue nomear duas tarefas com `Files:` disjuntos em 60 segundos, não existe onda — roda um agente.**

## 13.10 Checklist de despacho

A onda sai quando a resposta é **sim** para todas:

- [ ] O plano existe em `docs/ondas/<id>.md`, versionado, com os cinco campos por tarefa?
- [ ] Nenhuma tarefa depende de outra da mesma onda, e os `Files:` são disjuntos por caminho exato?
- [ ] `tree:check` (dicionário §2.7) passa antes do despacho?
- [ ] Toda tarefa tem `Portão:` com nome do dicionário §2 e saída binária? (Parte 0.2, Regra 2)
- [ ] Nenhuma tarefa é D0, e todas têm `Modelo:` declarado sem herança por omissão? (Parte 0.3)
- [ ] O custo somado da onda cabe em `cost:check`, e ela se justifica por um cenário de 13.2?
- [ ] `hooks:check` passou hoje?
- [ ] Todas as tarefas saem na mesma mensagem, e o commit é seu, lendo `HEAD` a cada commit?
- [ ] Depois de fechar: `verify` verde e revisores despachados sobre o registro?

Cada "não" é uma onda que ainda não deve ser despachada.

---

# PARTE 14 — Adoção em projeto que já existe

As Partes 0 a 11 pressupõem F0 → F8 numa base nova. O caso real é outro: vinte migrations,
zero teste, zero portão, rodando em produção, e ninguém com uma semana livre para parar.
Brownfield não é o mesmo pipeline mais devagar: nele o portão nasce **reprovando**, e portão
que nasce reprovando é portão que se aprende a pular. O dicionário diz isso de
`headers:check` (§3); aqui vale para todos os outros.

## 14.1 A regra de ouro

> **Comece de onde a base realmente está, não de onde você gostaria que ela estivesse.**

O mecanismo é quem paga a conta. Portão bloqueante numa base que o reprova cobra a dívida
inteira da primeira pessoa que entrega um hotfix não relacionado. Sexta 19h, cliente
esperando: a decisão é sempre `--no-verify`, e o portão desligado não volta — religar custa
o mesmo que ligar, mais o custo político de já ter falhado. É o `warn` → `error` que você já
faz com `lint`, generalizado para **todo** portão da §2.

> **Todo portão tem quatro estados, e nenhum portão pula direto para o quarto.**

| Estado | O que faz | Quem paga | Promove quando |
|---|---|---|---|
| 0. Desligado | Não roda | Ninguém | Existe comando com o nome do dicionário |
| 1. Aviso com contagem | Roda, imprime `N`, sai 0 | Ninguém | `N` começou a cair |
| 2. Catraca | Reprova só se `N` **subir** | Só quem piorou | `N = 0` |
| 3. Bloqueante | Reprova se `N > 0` | Todos | — |

**Regra dura: nenhum portão entra no estado 3 com contagem maior que zero.**

A diferença que importa é entre 1 e 2: o estado 1 depende de alguém olhar, o estado 2 é
determinístico e mesmo assim não cobra da pessoa errada. Na Parte 0.3, o estado 1 mantém a
fase em **D1** — quem lê o número e decide é você; o estado 2 permite **D2**, porque o
agente ganha condição de parada honesta.

## 14.2 A ordem de adoção

Ordenada por retorno dividido por custo, com uma restrição que muda tudo: **o primeiro
portão bloqueante tem que ser um que já passa limpo hoje.** Sem isso, o segundo passo ensina
o time a contornar portão.

| # | Passo | Custo | Nasce verde? | Portão (nome do dicionário) | Nível |
|---|---|---|---|---|---|
| 0 | Diagnóstico (14.3) | horas | — | nenhum: só mede | **D0** classificar |
| 1 | Tratar o que o diagnóstico marcou como incidente | horas a dias | — | `secrets:scan:full`; consulta de RLS da Parte 3.1 | D0/D1 |
| 2 | `.gitattributes` + renormalização | minutos | sim | `tree:check` limpo depois de renormalizar | D2 |
| 3 | CI rodando `build`, e `secrets:scan --staged` no tier 1 | minutos | **sim** | `build`, `secrets:scan` | D2 |
| 4 | `.perfil` na raiz + `CLAUDE.md` + comando único | horas | sim | `profile:check`, `verify` (tier 2) | D0 declarar / D1 |
| 5 | Catraca de `typecheck` e `lint` | horas | **sim, por construção** | `typecheck`, `lint` no estado 2 | D2 |
| 6 | Inventário de rotas gerado do código | dias | sim | sem nome no dicionário — ver 14.6 | D2 |
| 7 | Contagem de tabelas sem RLS congelada (B1) | horas | **sim** | sem nome no dicionário — catraca de 14.4 | D2 |
| 8 | RLS nas tabelas existentes, por lote (B2) | semanas | **não** | `test:rls`; `pr:check` dimensiona o lote | D1 |
| 9 | `test:authz` + `test:idor` sobre o inventário | semanas | não | `test:authz`, `test:idor` | D2 |
| 10 | Caracterização (14.5), contratos, hooks e agentes (Parte 9, Fase D) | semanas | não | `test` no alvo, `test:contract`, `hooks:check` | D1/D2 |

**O passo 1 fura a fila** — incidente não espera ordem de adoção; o critério está em 14.3.
**Os passos 2 a 5 custam menos de um dia somados e nascem verdes**, e esse dia compra o
direito de propor os passos 8 e 9, porque a essa altura o CI vermelho significa "você
quebrou algo", não "o CI está sempre vermelho".

**A Fase B da Parte 9 entra partida em duas**, porque a Parte 9 assume greenfield. B1
congela a contagem de tabelas sem RLS e exige que toda tabela nova nasça com ela, conferido
no diff da migration: nasce verde. B2 migra as existentes com os quatro testes da Parte 3.1:
nasce vermelho. A Parte 9 está certa sobre valor, esta sobre sequência — e com o navegador
falando direto com o banco, RLS ausente é incidente, não dívida.

## 14.3 O diagnóstico do dia 1

Objetivo único: transformar a base em números comparáveis entre execuções. **Nada é
corrigido nesta passada** — mesma regra do prompt de auditoria da Parte 3.11: misturar
medição com correção faz você corrigir o que é fácil em vez do que é caro. A saída é **uma
linha de campos `nome:valor`**. O agregador que a monta **não está implementado**: hoje você
roda os campos à mão e cola a linha no registro. Quando existir, nasce `.mjs` em `scripts/`
(§5 e §6) — no Windows, `.sh` depende de um bash que não está no `PATH`.

| Campo | Leitura binária | O que ela decide |
|---|---|---|
| Sem CI | **Bloqueia a adoção inteira** | Portão sem lugar para rodar é sugestão. O passo 3 vira o primeiro |
| `.env` versionado, ou segredo no histórico | **Incidente** | O que `secrets:scan:full` acha, você revoga antes de limpar (Parte 3.4) |
| Variável com prefixo público (`VITE_`, `NEXT_PUBLIC_`…) | Inspeção manual hoje, uma a uma — **D0** | Prefixo público = publicado (Parte 3.4). Chave é incidente; URL de API é backlog |
| Tabelas sem RLS, agregando a consulta da Parte 3.1 | Depende de quem fala com o banco | Incidente em BaaS, backlog alto com API própria |
| Zero teste | Backlog, mas **decide a ordem** | O primeiro portão não pode ser `test`. Vai para o passo 3 |
| Rotas com `:id` | Backlog alto | É o tamanho do inventário que `test:idor` consome (Parte 3.3) |
| `core.autocrlf` ligado sem `.gitattributes` | Backlog, prioridade máxima | Passo 2. Sem isso o primeiro portão de forma reprova o repositório inteiro |
| Escapes (`eslint-disable`, `@ts-ignore`, `.skip(`) | Baseline de catraca | É o termômetro do 14.8 |

### O que muda por perfil

O perfil vem das três perguntas do dicionário §4, parando na primeira que der NÃO. O eixo
que decide se um achado é **incidente** é outro — quem fala com o banco (Parte 3.1) — e os
dois se cruzam sem se substituir.

| Perfil | O diagnóstico acrescenta | Primeiro portão bloqueante |
|---|---|---|
| SITE | `size:check`, `test:meta`, `links:check`, `lh:check`; `headers:check` contra a URL publicada | `build` |
| APP | Inventário de rotas `:id`; `test:rls` só se o navegador falar direto com o banco (§2.2, nota ²) | `build` |
| SAAS | Idem APP, mais `test:input`, `test:logging` e a contagem de tabelas sem RLS | `build` |
| CRM | Idem SAAS, mais inventário de PII e caminho de eliminação (`test:erasure`, Parte 3.9), `test:import`, `test:dedupe`, `test:read-audit` | `build` |

**Ferramenta interna de um cliente só, com login, cujo dado principal é de quem usa o sistema,
é APP** — a §4 responde NÃO na P2 e na P3. Chamá-la de CRM faz você comprar `test:import`,
`test:dedupe` e `test:read-audit` que não protegem nada ali, e portão que não protege nada é o
primeiro a cair. Um cliente só não basta para ser APP: se o dado principal é de quem não usa o
sistema, a P2 responde SIM e é CRM single-tenant.

### Incidente em andamento × item de backlog

> **É incidente quando o dado já está acessível agora por quem não deveria. É backlog quando
> o risco depende de uma mudança futura de código.**

| Achado | Classificação | O que você faz hoje à tarde |
|---|---|---|
| Tabela sem RLS com o navegador falando direto com o banco | Incidente | Liga RLS + `FORCE` + policy, na ordem da Parte 3.1 |
| Chave válida no histórico, ou service role em arquivo de frontend | Incidente | Rotaciona. Limpar histórico e mover para o BFF é a segunda etapa |
| Rota `:id` sem filtro de tenant, confirmada por requisição real | Incidente | Corrige a query. O teste vem depois |
| Tabela sem RLS com API própria na frente | Backlog alto | Passo 8 |
| `typecheck` com dezenas de erros, zero teste | Backlog | Baseline de catraca no passo 5; testes nos passos 9 e 10 |

**Classificar é D0.** O gatilho é automático — o diagnóstico cospe o número —, mas decidir
se aquele número é incidente depende de saber quem alcança o dado, e isso não está no
repositório.

**Armadilha:** sair corrigindo o que apareceu primeiro. A saída é uma linha justamente para
você ler todos os campos, classificar todos, e só então abrir um editor.

## 14.4 Como ligar um portão numa base que o reprova

| | A. Corrigir tudo antes | B. Aviso com contagem | C. Baseline congelado (catraca) |
|---|---|---|---|
| Custo inicial | Alto e concentrado | Baixo | Baixíssimo |
| Vira útil | Depois da correção inteira | Devagar, conforme a contagem cai | No mesmo dia, para código novo |
| Quem paga | Você, agora, num PR grande | Quem toca o arquivo, se olhar | Quem escreve código novo |
| Risco | PR acima do teto da Parte 6 → revisão ruim → regressão silenciosa | Aviso que ninguém lê vira ruído | A dívida antiga fica invisível para sempre |
| Nível | D2 quando `--fix` resolve; D1 quando não | D1 | D2 |

Os cortes de `V` (violações) são **escolha do autor**; o que não é escolha é a direção. E
**PR de formatação em massa não contém mudança de comportamento** — se contém, ninguém
revisa, e é ali que entra a regressão.

| `V` | Correção é mecânica (`--fix`, codemod)? | Escolha |
|---|---|---|
| 0 | — | Bloqueante hoje. É o passo 3 da 14.2 |
| Dezenas | Sim | **A**, num PR só de forma, com o SHA em `.git-blame-ignore-revs` |
| Dezenas | Não | **B**, com data de virada escrita no PR |
| Centenas | Sim | **A por lote**: um lote por PR, bloqueante ao fim do último |
| Centenas | Não | **B**, e o número na descrição do PR |
| Milhares, ou código gerado e vendorizado | Qualquer | **C**, com `ignore` explícito e comentado |

**Regra dura: se quem paga o custo da correção não é quem criou a dívida, a opção é sempre a
C.** Vale para o dev que herdou o projeto, e principalmente para você quando o autor da
dívida é o você de dois anos atrás.

### A catraca, sem script novo

A catraca **não é portão novo**: é o estado 2 de um portão que já tem nome. `lint` continua
se chamando `lint`, e só o `package.json` sabe em que estado ele está (§1: o nome é a
interface). A mecânica:

1. Um arquivo versionado guarda o teto por alvo. É o baseline.
2. Contagem **acima** do teto: sai 1. É o único caso de reprovação.
3. Contagem **abaixo**: reescreve o teto e sai 0. A contagem só desce.
4. Alvo sem teto ainda: grava o teto, sai 0 e imprime que gravou.

No CI o checkout é efêmero e o teto apertado some — o CI só reprova subida, que é o correto;
quem commita o teto apertado é o tier 1 local. O baseline o agente não edita, senão o D2 da
Parte 0.3 se resolve subindo o teto. Quem impõe isso é `scripts/hooks/protege-catraca.mjs`:
`PreToolUse` com matcher `Write|Edit`, fail-closed, barrando `*baseline*.json`,
`*baseline*.txt`, `.catraca/**` e `*.lintbaseline*`, com dois códigos de saída (`0` libera,
`2` bloqueia). Quem grava o baseline legitimamente é o próprio alvo do portão, que roda como
processo e não como `Write` — apertar o teto segue automático, afrouxar exige humano. Os
casos estão em `hooks:check`: `.lintbaseline.json` esperando `2`, `docs/baselines.md`
esperando `0`.

**Armadilha:** dois PRs em paralelo apertam o baseline e conflitam nele. A resolução é
sempre o **menor** número, e depois roda o alvo de novo para recalcular. Pelo maior, você
reabre a dívida sem ninguém perceber.

## 14.5 Código sem teste que você não vai testar agora

Escrever a suíte "de verdade" antes de mexer em qualquer coisa é a resposta que ninguém
executa:

> **Teste de caracterização** — que grava o comportamento atual como esperado, mesmo quando
> o comportamento atual está errado — **antes de refatorar. Sempre.**

Teste que chama a função e não afirma nada sobe cobertura e não trava nada. Caracterização
com asserção trava — inclusive o bug, e congelar o bug é a intenção: o refactor prova que
**não mudou nada**. Grave se lançou, o código de erro e **se gravou linha no banco** — o
terceiro pega quem persiste antes de validar.

Caracterização verde não prova nada sozinha, porque nasce verde por construção. O portão que
diz "há fotografia suficiente para refatorar isto" é cobertura por arquivo restrita ao alvo
da semana — aqui cobertura é a ferramenta certa, porque a pergunta é quais linhas estão
congeladas. **O limiar é escolha do autor: 80% das linhas do arquivo a ser tocado, nunca uma
meta global.** Quatro regras evitam a dívida:

1. **Arquivo separado** (`*.caracterizacao.spec.ts`): único teste autorizado a afirmar
   comportamento errado.
2. **Nunca conta como critério de aceite.** Os AC vêm da F1, em Given/When/Then.
3. **Morre quando a spec nasce**, no mesmo PR — senão você cimentou o bug.
4. **Correção de bug em commit separado**: `refactor:` não altera snapshot, `fix:` altera.

**Armadilha:** gravar o objeto inteiro, com timestamps e IDs. O snapshot fica enorme, muda a
cada execução, e a revisão vira "aceita tudo" por reflexo. Normalize os campos voláteis
antes de gravar — snapshot que ninguém lê dá a sensação de rede sem a rede.

## 14.6 O primeiro agente num projeto legado

A tarefa errada para dar primeiro é "refatore o módulo X". **Refactor em brownfield não tem
portão**: o portão de um refactor é "os testes continuam passando", e você mediu zero teste,
então a Regra 2 da Parte 0.2 classifica a tarefa como D1 e você lê cada linha — o trabalho
que queria delegar. Some o custo assimétrico de reverter (refactor errado é dívida
distribuída, descoberta semanas depois) e um diff que estoura o teto da Parte 6.

O objetivo das três primeiras rodadas não é o código produzido: é descobrir se o seu harness
funciona nesta máquina — se o agente roda `pnpm`, sobe o banco de teste, acha o seed, lida
com caminho `C:\` e com CRLF. Cada falha aí é diagnóstico do harness, não do modelo.

| Rodada | Tarefa | Portão | Nível | O que você aprende |
|---|---|---|---|---|
| 1 | Gerar o inventário de rotas a partir do código | `--check` comparando o markdown com as rotas registradas no app | D2 | Se ele executa comando e lê saída |
| 2 | Caracterização do serviço mais tocado (`git log` decide qual) | `test` no alvo + limiar de cobertura do 14.5 | D2 | Se ele sobe banco de teste e seed |
| 3 | E2E do caminho feliz + uma negativa cross-tenant (Parte 3.3) | `test:e2e` (tier 4) | D2 | Se os AC existentes são traduzíveis sem você no meio |
| 4+ | Refactor, agora com 1 a 3 no lugar | os portões de 1 a 3 | D2 | — |

Documentação genérica não tem portão — por isso não é ela que você pede. O **inventário
gerado do código** tem, e é o insumo que a Parte 3.3 assume existir ao filtrar rotas com
`:id`. **Esse portão não tem nome no dicionário:** funciona como comando, mas enquanto a §2
não o registrar, não é citável por outra parte.

**Sem portão automático — revisão humana, D0:** decidir se uma rota do inventário *devia*
existir. O `--check` prova que o markdown corresponde ao código; nada prova que o código
corresponde ao produto.

## 14.7 Sinal de parada — quando não adotar isto

Um portão custa `C` para montar e `c` por execução, e paga `p × D` por mudança que cobre —
`p` a fração de defeitos que pega, `D` o custo médio do defeito. Com `N` mudanças no resto
da vida do projeto, **vale a pena quando `N × p × D > C + N × c`**: **onde não vai haver
mudança futura, o retorno é zero por construção.**

| Situação | Critério objetivo | Adota | Não adota |
|---|---|---|---|
| Projeto com desligamento marcado | Data no calendário; o corte é escolha sua | Passo 1 da 14.2 | Portões, contratos, agentes |
| Prova de conceito | **Sem usuário externo E sem dado real de pessoa E sem domínio próprio** — as três | Nada | Tudo |
| Script de uso único | Roda uma vez, saída conferida na hora, sem agendamento | Nada | Tudo |
| Protótipo que virou produto | Falhou qualquer um dos três critérios de PoC | 14.2 inteira, do passo 0 | — |
| Repositório que só você lê, mudança rara | `N` baixo e nenhum agente escrevendo | Passos 1 a 4 | 5 em diante |

**Regra dura: prova de conceito com dado real de cliente não é prova de conceito — é
produção sem processo.** É a reclassificação mais cara: o protótipo ganhou login, ganhou
três clientes, e agora tem PII sob LGPD rodando sem RLS e sem inventário de dados (Parte
3.9).

Mesmo no projeto que vai morrer entram três coisas: `secrets:scan:full` no histórico
inteiro, a consulta de tabelas sem RLS da Parte 3.1 voltando vazia, e `.env` fora do
versionamento. As três defendem contra o **passado** — `N = 0` não zera o risco de uma chave
que já vazou nem de uma tabela já pública, e as duas seguem exploráveis depois do
desligamento. **Segurança é a única linha do documento sem sinal de parada.**

## 14.8 Armadilha: o big bang

**Armadilha:** ligar tudo numa semana. RLS, `test:rls`, `test:authz`, `test:idor`,
`typecheck` estrito, `lint` bloqueante, `size:check`, `pr:check`, `secrets:scan`, `sast` —
de uma vez, na segunda-feira.

A aritmética é a da Parte 0.1 aplicada a portões em vez de etapas: probabilidades
multiplicam. Seis portões novos não somam seis chances de reprovar; multiplicam a chance de
um PR qualquer passar em todos — e como nenhum foi medido contra a base antes, você não sabe
sequer o `p` de cada um. O resultado é sempre o mesmo: segunda o CI fica vermelho para todo
mundo; terça alguém entrega um hotfix com `--no-verify`; quarta aparecem `eslint-disable` e
`@ts-expect-error` em massa; quinta os testes flaky viram `it.skip`; sexta alguém desliga o
job "só até estabilizar" — e o job não volta. O dano não é a semana perdida: é que os
portões viram custo político, e o segundo pedido — o `test:rls`, o que realmente vale —
chega numa sala que já decidiu que isso não funciona.

**Regra dura: no máximo um portão novo por semana, e nenhum entra bloqueante com contagem
maior que zero.** O termômetro é a contagem de escapes, lida como catraca: estável ou
caindo, adicione o próximo; subindo muito acima do baseline — o corte é escolha sua —, para
de adicionar e afrouxa o último. **A válvula de escape é instrumento de medição, não
inimigo:** proibir `eslint-disable` só tira o seu único sensor.

---

# PARTE 15 — O harness: primitivas e portabilidade

Harness é o conjunto de arquivos que envolve o agente: o que ele vê, o que pode fazer e o que
acontece em volta dele. Não é o modelo — é todo o resto, e é a única parte que você controla. O
documento usa as cinco primitivas desde a Parte 7 sem nunca compará-las, e o hook de referência
da Parte 11.3 é `bash` + `jq` — que não existem numa instalação limpa de Windows.

## 15.1 As cinco primitivas

| Primitiva | Quando dispara | Agente pode ignorar? | Custo de contexto | Problema que resolve |
|---|---|---|---|---|
| **Regra** (`CLAUDE.md`, `AGENTS.md`) | Sempre, antes do 1º turno | **Sim** — é texto, compete com todo o resto | Sempre carregado: cada linha é paga em todo turno de toda sessão | Fato estável do repositório; convenção que muda a forma do código |
| **Skill** | Quando o agente julga aplicável, ou quando você digita `/nome` | **Sim** — pode simplesmente não invocar | Só a `description` fica sempre visível; o corpo entra ao invocar | Procedimento longo usado de vez em quando: intake, auditoria, release |
| **Subagente** | Quando o agente principal despacha | **Sim** — pode não despachar | Zero no principal enquanto roda; volta só o parecer | Trabalho que suja contexto; parecer que não pode ser contaminado por quem escreveu o código |
| **Hook** | No evento, sempre, fora do turno | **Não.** Ele não vê o hook e não negocia com ele | Zero. Só o `stderr` entra, e só quando bloqueia | Limite que não pode depender de boa vontade |
| **Comando agendado** | Horário ou evento externo | Não se aplica — não há sessão | Zero | Trabalho sem gatilho dentro da sessão: triagem, deps, expurgo |

**A divisão que organiza a tabela inteira:** as três primeiras são *persuasão* — texto
competindo pela atenção do modelo; as duas últimas são *mecanismo* — código que roda quer o
modelo concorde ou não. Persuasão é probabilística; mecanismo é determinístico.

**Regra dura: no `CLAUDE.md` entra só o que é verdade em toda sessão.** Procedimento usado de
vez em quando é skill; limite que não pode ser ignorado é hook; comportamento é teste. Regra que
cresce dilui as outras, porque a atenção é finita e a conta é paga em todo turno. E **o
subagente não vê o histórico de quem despachou** — é o que faz o parecer do `revisor` (Parte 7)
valer alguma coisa, com um corolário duro: **não despache para subagente nada que dependa da
conversa.** Passe o artefato, não a lembrança (Regra 3 da Parte 0.2).

## 15.2 A regra de escolha, e o desempate da F8

> **Se o agente pode ignorar e o custo de ignorar é alto, não pode ser regra nem skill — tem
> que ser hook.**

É a Parte 11.3 generalizada — "a skill ainda depende do agente decidir invocá-la; o hook não"
virando critério de projeto: você não escolhe a primitiva pela elegância, escolhe pelo custo de
o agente não colaborar. A F8 lista as três saídas de um incidente — teste, regra, hook — e
manda escolher "o mais baixo da lista que resolva"; ao pé da letra, isso empurra para teste
inclusive o que teste não pega. Falta o critério de "resolve", e ele é temporal: **o teste roda
depois do ato.** Código errado numa branch é reversível; banco apagado não é, chave publicada
não é (Parte 3.4). Quando o ato *é* o dano, o teste chega tarde por construção.

> **Desempate da F8: entre as primitivas que resolvem, vence a mais determinística que couber —
> hook, depois teste, depois regra.** O hook cobre o ato e é a única das três que o agente não
> pode ignorar; o teste cobre o resultado e só resolve quando o dano é reversível; a regra é
> probabilística e nunca resolve sozinha.

| Pergunta, nesta ordem | Se sim |
|---|---|
| O dano passa por um evento que o harness intercepta — um comando, uma escrita de arquivo? | **Hook** |
| O dano só existe depois de rodar o código, e é reversível antes do merge? | **Teste** — o hook não tem o que inspecionar |
| Sobrou forma e convenção, e errar custa um comentário de review? | **Regra** |
| O produto é um parecer que não pode ser contaminado por quem escreveu o código? | **Subagente** |
| Não existe gatilho dentro da sessão? | **Comando agendado** — os D3 da Parte 7 |

**O mesmo risco costuma precisar de duas:** o hook do harness protege a sessão do agente, o
pre-commit do `git` protege o repositório de você (`secrets:scan --staged`, tier 1).

## 15.3 Fail-open × fail-closed

Todo hook falha — `node_modules` a meio de instalar, disco cheio, campo renomeado no harness. O
que decide se foi susto ou incidente é o comportamento **na falha**, pelo critério do §5:

> **Hook que ADICIONA melhoria falha aberto. Hook que IMPÕE limite de segurança falha
> fechado. Se você está em dúvida sobre qual dos dois um hook novo é, essa dúvida já é o sinal
> de que a decisão precisa estar escrita ao lado do código.**

Formatar o arquivo tocado é melhoria: se o formatador não rodou, o pior caso é um diff feio.
Impedir `prisma migrate reset` é limite: sem inspecionar o comando, o hook não tem como afirmar
que ele é seguro. **Fail-closed não é "quebrou, bloqueia" — é "não libera o que não conseguiu
provar seguro"**, que é o que os três hooks de `scripts/hooks/` fazem.

**Matcher estreito é parte do contrato do hook fail-closed:** se ele só dispara em comandos de
terminal, o raio de explosão de um bug nele é comandos de terminal, e a saída de emergência é
você rodar o comando. E **falha aberta é permitida; falha aberta silenciosa não** — hook que
falha calado é pior que hook nenhum, porque hook nenhum você sabe que não tem.

## 15.4 Por que `.mjs`, e não `bash` + `jq`

O dicionário §5 é categórico: todo script próprio é `.mjs` (Node), nunca `.sh`. O motivo aparece
inteiro no hook da Parte 11.3 numa máquina sem `jq`: `jq -r '.tool_input.file_path'` vira
`command not found`, a variável fica vazia, e o `case ""` cai no `*) exit 0`.

| Cenário | Saída do hook | Efeito |
|---|---|---|
| Com `jq` no PATH, arquivo em `apps/` | `2` | Bloqueia, como projetado |
| **Sem `jq` no PATH, mesmo arquivo** | **`0`** | **Libera, e não avisa ninguém** |

Ele não falha fechado nem aberto de propósito: **falha aberto em silêncio**, o modo que a 15.3
proíbe — fica registrado no `settings.json`, parece instalado e não protege nada. O mecanismo da
Parte 11.3 continua valendo inteiro (matcher `Write|Edit`, `exit 2`, mensagem no `stderr`); muda
o veículo. **`bash` onde o CI roda, Node onde a sua máquina roda:** o portão F6 da Parte 3.12 é
corretamente `bash` com `set -euo pipefail` porque roda no runner Linux; o hook roda no seu
Windows, onde Node já é dependência obrigatória.

## 15.5 O contrato de hook, e o helper que o torna seguro

**O contrato geral é estável entre harnesses: o evento chega em JSON pelo `stdin`, a resposta
sai pelo código de saída.** O que **não** é estável: o nome do evento (`PreToolUse` e afins), o
campo que carrega o comando ou o caminho, e qual código significa bloqueio — a fonte disso é a
documentação do seu harness. A defesa não é adivinhar: é o helper `campo()`, que aceita vários
caminhos e devolve o primeiro com string não vazia. Um caminho a mais custa nada; um campo lido
errado custa um hook que libera tudo.

**Regra dura (dicionário §5): um hook sai com `0` ou com o código de bloqueio documentado —
nunca um terceiro valor.** Em Node o terceiro valor é fácil de produzir por acidente: exceção
não tratada termina o processo com `1`. Se o harness trata "diferente de zero" como bloqueio, o
hook bloqueia por um motivo que não é o dele; se trata só `2`, o `1` vira hook que não faz nada.
Os dois helpers estão em `scripts/payload.mjs`. `lerStdin()` lê o `stdin` inteiro e nunca lança —
TTY, erro de stream e um teto de 2 s resolvem para o que houver. `lerEvento()` devolve objeto ou
`null`, nesta ordem: apara o texto (o `trim()` leva o BOM junto), trata vazio como `null`, deixa o
`JSON.parse` que lança virar `null`, e no fim só devolve o que for objeto e não for array.

Os quatro payloads ilegíveis colapsam num sinal só porque a resposta do hook é a mesma para
todos. **Armadilha:** a guarda escrita às pressas — `try { ev = JSON.parse(bruto) } catch
{ ev = {} }` — parece cobrir e não cobre. `JSON.parse("null")` **não lança**: devolve `null`, o
`catch` nunca roda, o primeiro `ev.tool_input` estoura `TypeError`, e o processo termina com `1`
— nem `0`, nem `2`. E `typeof null === 'object'` faz a segunda guarda mais comum passar também.

## 15.6 Um hook completo

`scripts/hooks/bloqueia-destrutivo.mjs` é o hook que a armadilha da F2 promete — *"isso vai num
hook de bloqueio, não numa instrução em prosa"*. `PreToolUse`, matcher `Bash`, limite de
segurança, logo fechado: `0` libera, `2` bloqueia. Ele barra reset de banco, DDL `drop`/`truncate`,
`rm -rf` e `git push --force` — com lookahead que libera `--force-with-lease`, a variante que
aborta se o remoto andou. A lista de expressões mora no arquivo, e cada caso dela tem prova em
`scripts/hooks-check.mjs`; copiada para cá, uma das duas cópias envelhece.

Três decisões de desenho: **`comando === ''` bloqueia** — fail-closed em uma linha, e o custo do
falso positivo é você rodar o comando no seu terminal; **o `.catch()` no fim** impede que uma
rejeição não tratada termine o processo com `1`, que não é nem liberar nem bloquear; **nenhuma
mensagem tem acento**, porque o `stderr` passa pelo console do Windows, que pode não estar em
UTF-8 — e acento vira lixo justo na linha que precisa ser lida.

Ao lado dele, dois hooks de matcher `Write|Edit`: `protege-segredo.mjs` barra escrita em `.env` e irmaos (`.envrc`, `.env-backup`),
`*.pem`, `id_rsa` e `credentials.json`, e libera `.env.example` e irmãos, porque bloquear o
arquivo que só tem nomes de variável é o falso positivo que faz o leitor desregistrar o hook; e
`protege-catraca.mjs` barra escrita em baseline (`*baseline*.json`, `*baseline*.txt`) e em
`.catraca/`. **O registro dos três** está em `scripts/README.md`: o comando é `node
scripts/hooks/x.mjs`, **nunca `./x.mjs`** — o shebang não é executável no Windows, e fica no
arquivo para o dia em que o hook rodar no CI. Barra normal sempre.

## 15.7 O portão `hooks:check` — os três casos

O dicionário torna `hooks:check` obrigatório nos quatro perfis (§2.7): *todo hook responde certo
nos três casos, inclusive stdin `null`*. Caminho feliz sai `0`; o comando que o hook existe para
barrar sai com o código de bloqueio; payload ilegível — `null`, vazio, JSON quebrado, `[]` — sai
conforme a **classe** do hook: fechado `2`, aberto `0`. **O terceiro caso é o que separa um hook
de um enfeite:** `1` significa a guarda ingênua da 15.5, e `0` num hook de limite significa
fail-open sem ter sido projetado para isso.

Testar à mão não sobrevive a sexta-feira. `scripts/hooks-check.mjs` roda cada hook nos casos
declarados mais os quatro ilegíveis, e reprova um `.mjs` em `scripts/hooks/` sem caso declarado.
Saída de `node scripts/hooks-check.mjs` nesta máquina (Node v24.14.0, Windows 11), recortada:

```
bloqueia-destrutivo.mjs  (limite fechado)
PASS  feliz: --force-with-lease e a variante segura: saiu 0, esperado 0
PASS  bloqueado: prisma migrate reset: saiu 2, esperado 2
PASS  bloqueado: evento sem campo de comando: saiu 2, esperado 2
PASS  stdin `null` literal: saiu 2, esperado 2 (fechado)
PASS  stdin vazio: saiu 2, esperado 2 (fechado)
PASS  JSON quebrado: saiu 2, esperado 2 (fechado)
PASS  array no lugar de objeto: saiu 2, esperado 2 (fechado)
[+6 casos deste hook, os 13 de protege-segredo, os 13 de protege-catraca e a checagem de que
os três têm caso declarado]

registro no harness
FAIL  ...\.claude\settings.json nao existe: registro NAO verificado (nenhum hook provado ligado)

53/54 casos passaram
```

O registro é a última seção do portão de propósito: **hook desregistrado é hook que não roda.**
Sem `settings.json` ela reprova — a primeira versão imprimia `SKIP` ali e fechava `53/53`
verde, sem provar hook ligado nenhum (15.10). Onde o `settings.json` existe, cada caminho `.mjs`
citado nele e cada hook declarado vira mais um caso, e desligar passa a exigir um diff. O dicionário põe `hooks:check` no tier 3 (§2.7); medido nesta máquina, **2,2 s para os
53 casos** — mediana de sete execuções, método em `scripts/README.md`.

## 15.8 O catálogo: nove hooks que valem a pena

Os três primeiros existem em `scripts/hooks/` e passam no `hooks:check`. Os outros seis são
projeto: só entram depois de nascer pela 15.9, com o caso de teste do incidente (perfis do §4).

| # | Hook | Evento | Modo | O que fica impossível depois dele | Perfil |
|---|---|---|---|---|---|
| 1 | `bloqueia-destrutivo` ✔ | antes de comando de terminal | **fechado** | O agente apagar o banco de dev no meio de um loop de teste, ou reescrever o histórico do remoto | AP SA CR |
| 2 | `protege-segredo` ✔ | antes de escrita de arquivo | **fechado** | O conteúdo de um `.env` ou de uma chave privada entrar no transcript, que não tem rotação | SI AP SA CR |
| 3 | `protege-catraca` ✔ | antes de escrita de arquivo | **fechado** | O agente regravar baseline ou `.catraca/` para o vermelho virar verde: o teto de dívida da Parte 14 só desce | SI AP SA CR |
| 4 | `bloqueia-segredo-publico` | antes de escrita de arquivo | **fechado** | Variável de prefixo público receber valor com forma de chave e ir para o bundle (F6, pergunta 4) | SI AP SA CR |
| 5 | `protege-branch` | antes de comando de terminal | **fechado** | Commit direto em `main`/`develop` de dentro da sessão, furando o fluxo da Parte 6 | SI AP SA CR |
| 6 | `migration-append-only` | antes de escrita em migration já commitada | **fechado** | Reescrever migration já aplicada em vez de criar a próxima (F2) | AP SA CR |
| 7 | `formata-arquivo-tocado` | depois de escrita de arquivo | aberto | O diff da revisão chegar poluído por formatação, e o `lint` reprovar por isso | SI AP SA CR |
| 8 | `avisa-diff-acima-do-teto` | fim de turno | aberto | Passar do teto de ~400 linhas da Parte 6 sem saber, e descobrir só no `pr:check` | SI AP SA CR |
| 9 | `exige-intake` (Parte 11.3, em Node) | antes de escrita em `apps/`/`packages/` | aberto **com aviso** | Código de feature nova nascer sem as 5 perguntas da fase respondidas | SI AP SA CR |

**Comece por 1 e 2:** cobrem os dois danos irreversíveis do pipeline — banco apagado e chave
publicada. Deixe o 9 por último — a 15.10 explica por quê. **Custo de execução é
requisito:** o hook 7 formata um arquivo, não roda `typecheck` no monorepo, porque hook que o
leitor sente esperando é hook que ele desliga. Na quinta primitiva não há sessão nem hook, então
o que se afirma é que ela rodou (`schtasks /query /tn "..." /v /fo LIST`, `gh run list`) — e
**para os D3 da Parte 7, prefira o cron do CI ao Task Scheduler:** seu notebook às 3h está
desligado, e agendamento que não dispara é pior que nenhum.

## 15.9 Como um hook nasce

Hook não nasce de leitura de blog. Nasce da F8: **o incidente.** Sexta à noite, o agente em D2
fechando um teste de integração. O `prisma` acusa drift entre schema e migration; ele faz o que
a mensagem de erro sugere e roda `pnpm prisma migrate dev`. O banco de dev tinha o seed de 2
tenants (F2) **mais** os contatos que você criou à mão testando a tela de importação. Dropou e
recriou: zero dano em produção, zero PII, uma tarde perdida.

| # | Pergunta (Parte 2, F8) | Resposta neste incidente |
|---|---|---|
| 1 | Qual portão deveria ter pego e não pegou? | **Nenhum.** Todo portão roda *depois* do ato; aqui o ato era o dano |
| 2 | Caso único, classe ou falha estrutural? | **Classe:** qualquer comando destrutivo de banco dentro da sessão |
| 3 | Precisa de correção retroativa de dado? | Reseed. Barato porque o seed é determinístico (F2) |
| 4 | Precisa notificar alguém? | Não — dado de dev. Fosse produção com PII: runbook da Parte 3.9 |
| 5 | Que pergunta de intake teria evitado? | **Nenhuma.** O intake roda antes de codar; o comando foi digitado no meio da implementação |

As duas respostas "nenhuma", nas perguntas 1 e 5, são o diagnóstico: nem portão nem intake
alcançam isto. Aplicando o desempate da 15.2 — o dano passa por um evento que o harness
intercepta, logo **hook**, e o hook é o `bloqueia-destrutivo` da 15.6. Do incidente até ele:

1. Copie do transcript o payload real do evento que deveria ter sido barrado.
2. **Escreva o caso de teste antes do hook**, em `scripts/hooks-check.mjs`, esperando `2`.
3. Escreva o hook até `hooks:check` ficar verde nos felizes, bloqueados e nos quatro ilegíveis.
4. Registre no `settings.json` com **matcher estreito** e rode uma sessão real: se bloqueou algo
   legítimo, o matcher está largo — conserte no mesmo dia.

**Regra dura: todo hook nasce com um caso de teste que reproduz o incidente que o gerou. Hook
sem esse caso não entra no `settings.json`.** Sem o passo 2 você não sabe se o hook pega o caso
real — só que ele não quebrou. É a diferença entre cobrir casos e cobrir a classe (Parte 3.3).

## 15.10 Armadilha: o hook que bloqueia cedo demais

**Armadilha:** ligar um hook de *processo* antes de saber quais perguntas importam no **seu**
projeto. Ele bloqueia coisa legítima, você desliga, e não volta.

O mecanismo é previsível. Você lê a Parte 11, gosta, e liga o `exige-intake` na semana 1 — quando
ainda não tem as 5 perguntas certas para o seu domínio, porque o inventário cresce por incidente
e encolhe por repetição (Parte 11.4). O hook barra um hotfix de duas linhas, um spike que você
ia jogar fora, um ajuste de config em `packages/`. Na terceira sexta você comenta a linha "só
por hoje", e ela não volta — e o dano é maior que aquele hook: você aprende que hook atrapalha,
e o `bloqueia-destrutivo` da 15.9 nunca é escrito.

1. **Ordem de adoção por tipo, não por entusiasmo.** Hook de *segurança* pode nascer na semana
   1: barra uma ação rara e inequívoca. Hook de *processo* entra na Fase D da Parte 9.
2. **Um hook que barrou coisa legítima duas vezes está calibrado errado — conserte o matcher no
   mesmo dia, ou desligue de propósito.** É o que a F5 diz do teste flaky: o que ensina você a
   ignorar vermelho destrói o valor de todo o resto.
3. **Desligar tem que deixar rastro.** Comentar uma linha no `settings.json` é a única operação
   do harness sem portão sobre si mesma — por isso o `hooks:check` (15.7) confere os hooks
   declarados contra ele: **hook obrigatório desligado é portão vermelho.** E sem o arquivo
   também: a primeira versão saía `SKIP` com saída 0 nesse caso, e um repositório que ainda não
   tinha registrado hook nenhum passava no `hooks:check` — exatamente o estado do dia 1. Hoje
   `settings.json` ausente é `FAIL`: o portão prova que o hook funciona **e** que está
   registrado.

## 15.11 Níveis e portão desta parte

| Tarefa | Nível | Portão |
|---|---|---|
| Escrever, ajustar ou portar um hook; acrescentar caso ao `hooks-check.mjs` | **D2** | `hooks:check` |
| **Decidir se um hook é limite ou melhoria, e qual primitiva usar** (15.2, 15.3) | **D0** | sem portão automático — revisão humana |
| **Decidir quando ligar um hook de processo e o que fica no `CLAUDE.md`** (15.1, 15.10) | **D0** | sem portão automático — revisão humana |

---

# PARTE 16 — Os arquivos de perfil

A Parte 0.4 estabelece que perfil é o terceiro eixo do documento. Esta parte diz onde cada um
mora e como lê-lo.

**Regra de leitura: você lê a espinha inteira e UM arquivo de perfil.** Os outros três não são
leitura opcional adiada — são leitura que não te serve. Um site institucional não tem tenant,
e as 21 páginas sobre isolamento de tenant só competem pela sua atenção.

| Arquivo | Perfil | Quando é o seu |
|---|---|---|
| [`perfis/site.md`](perfis/site.md) | SITE | Ninguém faz login |
| [`perfis/app.md`](perfis/app.md) | APP | Tem login, mas um dono só |
| [`perfis/saas.md`](perfis/saas.md) | SAAS | Clientes que não podem se ver |
| [`perfis/crm.md`](perfis/crm.md) | CRM | Dado principal de quem não usa o sistema, com um cliente só ou vários |

Se você não sabe qual é o seu, a classificação são três perguntas na Parte 0.4 — leia antes de
abrir qualquer um dos quatro.

## A estrutura fixa

Os quatro arquivos seguem a **mesma ordem de seções**, e isso é deliberado: você consegue abrir
dois lado a lado e comparar a mesma seção sem reaprender a organização de cada um.

1. Quando este é o seu perfil
2. Fases que se aplicam, com o nível D de cada
3. `verify` e tiers — **citando** a Parte 12, nunca redefinindo
4. Segurança específica do perfil
5. Intake: quais perguntas valem
6. Armadilhas do perfil

## O que um arquivo de perfil não faz

**Não define portão.** Nome de portão, o que ele prova e em qual perfil é obrigatório vivem na
Parte 12, e só lá. Um arquivo de perfil que traz um bloco `"scripts":` com definição própria de
`verify` está errado por construção — foi exatamente assim que a primeira versão deste conjunto
produziu dois `verify` incompatíveis para o mesmo perfil.

**Não repete a Parte 3.** O `perfis/saas.md` é o mais curto dos quatro justamente porque o
documento original já cobre SAAS multi-tenant por inteiro; ele é um mapa de leitura da Parte 3,
mais o punhado de coisas que a Parte 3 não cobre.

**Regra dura:** perfil menor significa **menos portões**, nunca portão mais frouxo. Um SITE roda
menos verificações que um CRM; nenhuma delas passa com critério mais brando.

## Os scripts

Os portões que exigem código próprio estão em [`template-projeto/scripts/`](../template-projeto/scripts/), com
[`scripts/README.md`](../template-projeto/scripts/README.md) como índice: qual arquivo, qual nome de portão no
dicionário, qual tier, e o código de saída de cada caso.

Todos foram executados antes de entrar aqui. `node scripts/hooks-check.mjs` prova os hooks nos
quatro payloads ilegíveis — incluindo o texto literal `null`, que é JSON válido e derruba guarda
defensiva escrita às pressas (Parte 10).

---

## Referências

- OWASP Top 10:2025 — https://owasp.org/Top10/2025/
- OWASP API Security Top 10 — https://owasp.org/API-Security/
- Perry, Srivastava, Kumar, Boneh (2023), *Do Users Write More Insecure Code with AI Assistants?* — https://arxiv.org/abs/2211.03622
- Pearce et al., *Asleep at the Keyboard* (~40% de código Copilot com vulnerabilidade)
- CVE-2025-48757 — https://mattpalmer.io/posts/2025/05/CVE-2025-48757/
- GitGuardian, *State of Secrets Sprawl* — https://www.gitguardian.com/state-of-secrets-sprawl-report-2026
- Gitleaks — https://github.com/gitleaks/gitleaks
- Opengrep — https://github.com/opengrep/opengrep
- Bandit — https://github.com/pycqa/bandit
- OWASP ZAP — https://github.com/zaproxy/zaproxy
- Loop engineering (Claude Code) — https://claude.com/blog/getting-started-with-loops
- Steering Claude Code — https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- LGPD (Lei 13.709/2018) e guias da ANPD
