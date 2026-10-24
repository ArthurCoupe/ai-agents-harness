# Perfil CRM

> Este arquivo **cita** o `_DICIONARIO-CANONICO.md`; nada é redefinido aqui. Parte 3.1, 3.5,
> 3.9 e Parte 2 valem palavra por palavra — aqui só está o que muda quando o dado principal
> não é do seu usuário.

---

## 1. Quando este é o seu perfil

Você chega aqui pela **P2 do dicionário §4**: existe sessão, **e o dado principal é de pessoa
que não é usuária do sistema**. Dois SIM, e `.perfil` contém `CRM`. A pergunta de isolamento
(P3) vem depois e não decide o perfil — decide a variante.

| | SAAS | CRM |
|---|---|---|
| De quem é o dado sensível | Do usuário logado | De terceiro sem conta |
| Quem aceitou seus termos | O titular do dado | **Ninguém que aparece na tabela** |
| Seu papel na LGPD | Controlador | **Operador** |

**Regra dura: no CRM, cada linha de `contacts` tem um titular que nunca aceitou nada seu. Você
é operador, seu cliente é controlador, e nenhum dos dois é o titular.**

**Em contrato.** Operador trata dado **em nome** do controlador e **segundo instruções** dele.
Quatro coisas viram cláusula:

| Cláusula | O que precisa estar escrito | Por quê |
|---|---|---|
| Instruções documentadas | Quem instrui, por qual canal, e que o registro do pedido no seu sistema **é** a instrução | Sem isso você age por conta própria e vira controlador de fato |
| Subprocessadores | Lista nominal (Vercel, Supabase, e-mail, provedor de IA) e país | Seu cliente precisa dela para responder ao titular dele |
| Incidente | Seu prazo de aviso ao controlador, **estritamente menor** que o legal dele | Avisar no limite dele o deixa atrasado no dia em que souber |
| Fim do contrato | Eliminação ou devolução, com prazo e certificado | Dado sem finalidade não pode ficar |

**Em código, três consequências.** *(1)* Nenhuma query de produto cruza tenant, afirmado por
regra estática: confine todo acesso com service role — que pula RLS por definição — num
diretório único e escreva a regra de `sast` (§2.5) que falha quando `SERVICE_ROLE` aparece
fora dele. *(2)* Toda linha de contato carrega proveniência em colunas `NOT NULL` — `source`,
`source_ref`, `legal_basis` (com `CHECK` na lista de bases), `collected_at`, `imported_by` —
porque contato importado em janeiro sem origem é impossível de classificar em julho; quem mais
tenta entrar sem ela é a importação, então a asserção mora em `test:import` (§2.3). *(3)*
`tenant_id` vira fronteira jurídica: join entre `contacts` de tenants diferentes não é bug de
performance, é tratamento sem base legal — some ao quarto teste de `test:rls` (§2.2) a
asserção de que nenhuma view de produto toca `contacts` sem `tenant_id`.

**Armadilha:** usar contatos de todos os tenants para uma feature "inteligente" — dedup
global, enriquecimento cruzado, sugestão, treino de modelo. Não é decisão de produto, é
mudança de papel: ao definir a finalidade você virou controlador daquele tratamento e responde
sozinho. `test:rls` passa perfeitamente num sistema que cruza tenants deliberadamente — nenhum
portão pega intenção, e é por isso que a pergunta 1 do intake bloqueia.

### Tensão com a Parte 3.9

A 3.9 escreve as obrigações da posição de **controlador**: `GET /me/export` pressupõe titular
com sessão e o inventário é um só. No CRM a fatia onde você é operador concentra o volume de
PII e o risco de manchete, e tratar as duas com o mesmo mecanismo faz você responder direto a
um titular que não é seu. **Resolução: papel duplo, dois inventários, um mecanismo.** Usuários
do tenant, cobrança e sessões seguem na 3.9 sem alteração; contatos, atividades e anexos vão
para o fluxo triangular da seção 7, e a `audit_log` da 3.9 serve aos dois papéis. **A 3.9 não
está errada — está incompleta aqui.**

---

## 1.1 As duas variantes — leia antes de montar os portões

CRM **não** exige multi-tenancy. A P3 do dicionário §4, feita depois de você já estar aqui,
separa as duas variantes:

| | CRM single-tenant | CRM multi-tenant |
|---|---|---|
| Quem usa | Uma empresa, na própria base | Vários clientes, cada um com a sua base |
| Fronteira entre clientes | Não existe | Existe, e é estrutural |
| `test:rls` | ⚠️ nota ⁷ do dicionário §2.2 | ✅ sem ressalva |
| `test:idor` | ✅ **e é o portão principal** | ✅ |
| `test:erasure` · `test:import` · `test:dedupe` · `test:read-audit` | ✅ | ✅ |

**O que não muda entre as duas é o que define o perfil.** Os quatro portões de titular
protegem a pessoa na tabela, não a fronteira entre clientes. Uma empresa só, gerindo a própria
carteira, continua devendo eliminação, portabilidade e trilha de acesso a cada titular ali
dentro — nenhuma dessas obrigações nasce da multi-tenancy.

**No single-tenant, `test:idor` fica mais importante, não menos.** Sem RLS separando clientes,
a única coisa entre o usuário A e o registro do usuário B é o código da aplicação. É
exatamente a camada 3 da Parte 3.3 — a que é sempre esquecida — operando sozinha.

### O que fazer com `test:rls` quando não há tenant

Duas saídas, nesta ordem de preferência:

1. **Reescreva o portão como isolamento por papel e por dono do registro**, não por tenant.
   Aí ele volta a ter o que provar: um `vendedor` alcança o lead de outro `vendedor`? A policy
   permite gravar linha em nome de outro dono?
2. **ADR declarando que não se aplica**, e o script sai 0 apontando para ela.

O que não vale é manter o nome marcado obrigatório num portão vazio. Portão que nunca reprova
é teatro que custa tempo de CI — Parte 12 diz isso, e vale contra o seu próprio harness.

> **Correção de percurso, registrada.** A primeira versão deste conjunto definia CRM como
> "SAAS cujo dado principal é PII de terceiro", com a pergunta de isolamento **antes** da
> pergunta de dado de terceiro. Um CRM de uma empresa só caía em APP: parava na pergunta
> errada e nunca chegava à que descreve o risco dele. O defeito apareceu no primeiro uso real
> do framework, que é onde deveria aparecer.

## 2. Fases e níveis D — o que difere de SAAS

**Nada nos níveis.** A matriz de 0.4.3 dá a CRM exatamente os de SAAS (F0 D0, F1 D1, F2 D1,
F3–F7 D2, F8 D3). **CRM não ganha fase nova**: uma "F9 — Conformidade" seria fase terminal,
sem consumidor a jusante e sem portão próprio, o que quebra a Regra 3 da Parte 0.2. O peso do
perfil entra onde já existe fase.

| Fase | O que o CRM acrescenta ao artefato de saída | Portão |
|---|---|---|
| F0 | `docs/lgpd/papel.md`: por tabela, operador ou controlador. ADR da regra de identidade | revisão humana (D0) |
| F2 | Caminho de eliminação desenhado **junto** com o de criação; `docs/lgpd/inventario-pii.yaml`; retenção por tenant em coluna | `test:erasure` |
| F3 | Operação em massa grava na trilha **antes** de responder | `test:read-audit` |
| F6 | Trilha de leitura, não só de escrita | `test:read-audit` |
| F7 | Redação de PII em log deixa de ser boa prática e vira bloqueante | `test:logging` |

**Armadilha:** tratar a F2 do CRM como a do SAAS mais um `deleted_at`. Retrofit de eliminação
com base cheia é o item mais caro do perfil.

---

## 3. `verify` e os tiers

**CRM = SAAS + `test:dedupe`** no tier local, exatamente como o dicionário §3 define:

```
profile:check  lint  typecheck  test  build  size:check
test:authz  test:idor  bundle:scan  test:input  test:logging  test:dedupe
```

**O `lint` deste perfil cobre `@typescript-eslint/no-misused-promises` com checagem de tipos
nos caminhos de servidor** — rota de API, job de importação e de expurgo, edge function: tudo
que roda com service role ou outro segredo. A regra exige o projeto TypeScript carregado pelo
parser, porque sem isso ela não vê o tipo `Promise` e não pega o caso. **Foi neste perfil, num
CRM em produção, em 2026-08-23, que o `await` faltando em `cronAutorizado` — função async —
passou por `tsc`, `eslint` e `build` por dias: `Promise` é truthy, então a condição sempre
passava.** A correção foi o `await` e a regra
`no-misused-promises` type-aware ligada nos caminhos de servidor. Liga como toda regra nova de
lint (CLAUDE.md, Convenções): nasce em `"warn"`, sobe para `"error"` só quando a contagem de
violações chega a zero — numa base existente isso é a catraca da Parte 14.4. **Regra derivada:
condição sobre função async sem `await` é erro de lint, não de review.**

Nada de navegador, banco, rede ou deploy no tier 2 — teto de **90 s**, e acima de **120 s** o
portão muda de tier no mesmo dia (§3). `test:dedupe` cabe ali porque a parte determinística é
um índice único e algumas asserções de merge; o que precisa de banco vai para o tier 3,
`verify:ci`, com `test:import`, `test:erasure` e `test:read-audit`. A linha do tier 3 no
dicionário §3 não lista nenhum dos três: **falta a linha correspondente no dicionário**, e até
ela existir isto é escolha deste perfil, não regra.

Quatro portões carregam o peso do perfil. A definição de cada um é a do dicionário §2.3 e não
se repete aqui; o desenvolvimento está neste arquivo: `test:import` (seção 4), `test:dedupe`
(5), `test:read-audit` (6) e `test:erasure` (7) — este com a coluna do dicionário palavra por
palavra, *eliminação de titular apaga de verdade, inclusive backup, réplica, cache e índice*.

`test:erasure` é ⚠️ em APP e SAAS e **✅ em CRM**: aqui não existe a hipótese "não há dado
pessoal"; `size:check` segue ⚠️ (§2.4). E **o sinal que classifica o repositório como CRM é
estreito por escolha declarada**: criação de tabela de pessoa que não usa o sistema (`create
table` de `leads`, `lead_touches`, `prospects`, `contatos`, `contacts`, `oportunidades` ou
`opportunities`, só em contexto de `create table`), importação em lote **a partir de arquivo**
e a tabela `import_jobs`; `createMany` e `\bcpf\b` ficam de fora porque disparam em SAAS
legítimo (ver `scripts/profile-check.mjs` e `scripts/README.md`), e portão que grita no caso
legítimo ensina a contorná-lo.

---

## 4. Importação em massa

A operação mais pedida ("eu tenho uma planilha") e a mais perigosa: o único ponto onde dezenas
de milhares de PII de terceiros entram de uma vez, de um arquivo que você não controla.
Portão: **`test:import`**. Seis estágios, e **nenhum grava em `contacts` antes do quinto**:
upload para storage → decodificação → validação de 100% sem gravar → confirmação humana
(fronteira D1/D2) → job assíncrono em lotes → relatório de rejeitadas.

**(a) Limite antes de bufferizar.** Bytes, linhas e colunas são constantes que **você** declara
olhando a memória do seu runtime — escolha sua, registrada na ADR. O que não é escolha é *onde*
o limite roda: no middleware de upload, e não depois do `multer`/`busboy` ter bufferizado,
senão você já pagou a memória antes de recusar.

**(b) Decodificação.** Excel em português, "Salvar como CSV", produz `;` como delimitador e
Windows-1252; "CSV UTF-8" produz BOM (`EF BB BF`), caractere invisível grudado no primeiro
cabeçalho, e sua coluna `nome` nunca casa com `<BOM>nome` — o caminho padrão do seu cliente.
**Regra dura: nem encoding, nem delimitador, nem formato de data são adivinhados — os dois
primeiros são detectados, o terceiro é declarado no mapeamento** — `03/04/2026` é 3 de abril
aqui e 4 de março nos EUA.

**(c) Validar 100% antes de gravar 1.** O contrato da linha é Zod com `.strict()`, pela razão
da Parte 3.5(a): sem ele o CSV do cliente carrega uma coluna `role` ou `tenant_id` e o ORM
obedece. O validador devolve **relatório**, não exceção — contagens, as inválidas por linha e
campo, e uma **amostra das primeiras válidas**, sem a qual a confirmação humana não funciona:
aprova-se um mapeamento que trocou `telefone` por `CEP` e descobre-se 40 mil linhas depois.

**(d) Linha inválida no meio de dez mil — três políticas, um default.**

| Política | Estado final | Custo real |
|---|---|---|
| **Tudo-ou-nada** | Banco intocado; o usuário corrige e reenvia | Uma linha ruim bloqueia todas as boas |
| **Quarentena** | Staging com status; o usuário corrige na UI e promove | Mais código, e as linhas paradas **são PII sem finalidade** |
| **Parcial** | Válidas dentro, inválidas num CSV de retorno | Arquivo e banco divergem |

**Default do perfil: tudo-ou-nada. Quarentena é opção declarada por tenant. Parcial não existe
— nem com chave determinística.** A política é coluna com `CHECK` de dois valores
(`tudo_ou_nada`, `quarentena`); se `parcial` não está no `CHECK`, ninguém a liga por engano
numa sexta-feira. A parcial parece a mais gentil e produz o incidente mais caro: o usuário
conserta as doze linhas rejeitadas e reenvia o arquivo **inteiro**, porque é o que ele tem —
entram de novo as 9.988 já importadas, e o problema vira deduplicação, onde mora o dano
irreversível (seção 5). **O critério entre as duas que sobram:** tudo-ou-nada enquanto o tenant
traz planilha limpa; quarentena quando ele traz planilha suja **de forma recorrente**. E
quarentena sem `expira_em` é depósito permanente de PII de gente que nem chegou a virar
contato — o pior tipo de dado, porque não está no inventário, não aparece na exportação do
titular e ninguém lembra que existe. O prazo é coluna com índice.

**(e) Job assíncrono, não requisição HTTP.** Função serverless tem teto de execução, o cliente
fecha a aba, o proxy corta e o retry reexecuta metade. **Regra dura: importação é job com
estado no banco; a requisição HTTP cria o job e devolve 202.** A `idempotency_key` —
`sha256(tenant_id + hash_do_arquivo + mapeamento)`, com índice único por tenant — resolve duplo
clique e retry de worker; o worker pega trabalho com `FOR UPDATE SKIP LOCKED`, o que permite
dois workers sem coordenação externa; e a transação é por lote, nunca por arquivo, senão
dezenas de milhares de inserts seguram locks por minutos e travam o `autovacuum`.

**(f) CSV injection.** Célula que começa com `=`, `+`, `-`, `@`, TAB ou CR — o teste é
`/^[=+\-@\t\r]/` — é interpretada como fórmula ao abrir no Excel ou LibreOffice, inclusive DDE
(`=cmd|' /C calc'!A0`). O vetor completo do perfil: um formulário público de captação grava
`nome = "=HYPERLINK(...)"` no seu CRM; meses depois o dono da imobiliária exporta a base e a
fórmula executa na máquina dele, com os privilégios dele. **A defesa é na saída, não na
entrada** — mesma lógica do XSS na Parte 3.5(b): mexer no valor na entrada corrompe dado
legítimo (`-Sobrenome`, `+55…`) e não protege o que já está no banco. Na saída, o emissor de
célula de **texto** prefixa o valor perigoso com apóstrofo — marcador de texto, invisível no
Excel — e escapa aspas; o de número não prefixa.

**Armadilha, e é a que quase todo mundo deixa passar:** você protege a exportação de contatos
e esquece que **o CSV de linhas rejeitadas também é uma exportação** — ele ecoa exatamente o
conteúdo hostil que acabou de recusar; `test:import` afirma os dois caminhos.
**Delegabilidade:** D2 para o pipeline, porque o portão é forte e específico; a política por
tenant é **D1** — o agente propõe, você confirma na primeira importação de cada cliente.

---

## 5. Deduplicação

"Quando dois registros são a mesma pessoa" não tem resposta técnica. Tem resposta por domínio,
e a resposta errada é irreversível na direção do merge. Portão: **`test:dedupe`**.

| Chave | Força | Falha típica no Brasil |
|---|---|---|
| E-mail normalizado | Alta | `contato@empresa.com.br` da recepção; casal com um e-mail só |
| Telefone E.164 | Média | Telefone da empresa, do cônjuge, recado da vizinha |
| CPF | A única realmente única | Você provavelmente não deveria coletá-lo sem finalidade, e erro de digitação cria pessoa fantasma |
| Nome + empresa | Baixa | Homônimo. "João Silva" na mesma construtora acontece |
| Domínio do e-mail | **Não é identidade de pessoa** | É de organização — agrupa, nunca funde |

**Regra dura: só chave determinística funde sozinha; heurística sugere e para** — é a definição
de `test:dedupe` no dicionário §2.3, não preferência deste arquivo. E o portão da chave é um
índice, não um `if`:

```sql
-- um e-mail por tenant, ignorando os apagados (senão o soft delete bloqueia recadastro)
CREATE UNIQUE INDEX contacts_tenant_email_uk ON contacts (tenant_id, lower(btrim(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL;
```

As duas asserções de `test:dedupe`: mesmo e-mail **no mesmo tenant** é recusado, mesmo e-mail
**em tenants diferentes** é aceito. A segunda impede alguém de "consertar" a dedup com índice
único global — que além de errado é vazamento, porque o erro de duplicidade revelaria a
existência de um contato em outro tenant.

**Merge que não perde dado.** Nunca `UPDATE` + `DELETE`. O merge grava `winner_before`,
`loser_snapshot` e `movidos` (ids de atividades e negócios reatribuídos) numa tabela com
`REVOKE UPDATE, DELETE`, pela lógica da `audit_log` da Parte 3.9. Duas decisões deliberadas,
afirmadas por teste: **o perdedor não é apagado** — fica com `merged_into_id`, para que links
antigos e integrações externas resolvam — e **campo preenchido do vencedor nunca é
sobrescrito** — só campo vazio herda, senão você descarta dado sem avisar.

**O que o unmerge não desfaz.** Com `movidos` gravado, o banco é reversível na janela
declarada; irreversível é o que aconteceu por causa do merge — campo editado no vencedor depois
(o snapshot não sabe qual edição veio de qual pessoa), e-mail de campanha já enviado (pessoa A
recebeu comunicação sobre negócio da pessoa B), negócio criado no contato errado, exportação já
baixada, webhook já consumido pelo ERP do cliente. Por isso o `unmerge` **falha** — não avisa,
falha com 409 — se o vencedor foi editado depois do merge.

| Operação | Nível | Portão |
|---|---|---|
| Detectar candidatos, e executar merge por chave determinística | D2 | `test:dedupe` |
| Merge por sugestão heurística, par a par | **D1** | Humano confirma cada par; não sobe para D2 |
| Merge em massa | **D0** | **Sem portão automático — revisão humana** |
| Definir a regra de identidade do tenant | **D0** | **Sem portão automático — revisão humana.** ADR na F0 |

**Armadilha:** deixar o botão "mesclar duplicados" fazer merge em massa por heurística com um
clique, porque é o que o cliente pede na demo. É a operação de maior razão dano/clique de um
CRM — pior que `DELETE` sem `WHERE`, porque o `DELETE` você percebe.

---

## 6. Auditoria de leitura, não só de escrita

A `audit_log` da Parte 3.9 registra escrita. Num CRM isso não basta, porque a pergunta que o
dono do negócio faz é **"quem viu a lista de clientes antes de pedir demissão?"** e a que a
LGPD faz é "quem acessou os dados deste titular?". Portão: **`test:read-audit`**. Uma linha por
registro lido é insustentável: numa listagem paginada o custo é multiplicado pelo tamanho da
página. **Meça no seu volume**; o recorte que sobrevive é este:

| Evento | Registra? | O que grava |
|---|---|---|
| `contacts.export` (CSV, relatório, API em massa) | **Sim, sempre, síncrono** | filtro, contagem, hash do arquivo |
| `contacts.list` | Sim, 1 por requisição | filtro e contagem, **não os IDs** |
| `contacts.search` | Sim | o termo — atenção: **o termo é PII**, buscam por CPF e telefone |
| `contacts.read` (registro único) | Sim, com deduplicação por janela | `entity_id` |
| Render de campo, hover, tooltip | **Não** | Volume infinito, valor probatório zero |

**Regra dura: exportação é gravada de forma síncrona, antes de o arquivo sair, e falha de
auditoria cancela a exportação. Todo o resto é assíncrono e pode perder o último segundo.**
Exportação é o evento de exfiltração, o único que não pode se perder. A tabela é particionada
por mês, e aí retenção vira `DROP TABLE` da partição, O(1).

**Armadilha de tabela particionada:** o `REVOKE UPDATE, DELETE` no pai **não** protege as
partições. Acesso direto a `audit_read_log_2026_08` usa a ACL da partição, que nasce sem as
restrições do pai. O job que cria a partição do mês seguinte aplica o `REVOKE`, e
`test:read-audit` afirma que a partição recém-criada já está sem `DELETE` para `app_user`. O
buffer assíncrono precisa de `process.on('SIGTERM', flush)`, senão o deploy come o último
segundo — sempre aquele em que alguém estava exportando.

**Delegabilidade:** D2 para o código, porque o portão é forte. **D0** para o recorte da tabela
acima: decidir o que se registra tem custo de armazenamento e consequência jurídica. **Sem
portão automático — revisão humana.**

---

## 7. Direito do titular quando ele não tem conta

O titular não conhece você. Ele liga para a imobiliária e diz "apaga meus dados". O fluxo é
obrigatoriamente triangular:

```
  titular ──pedido──► CONTROLADOR (seu cliente) ──instrução──► OPERADOR (você)
     ▲                       │                                      │
     └────resposta───────────┘◄──────artefato + certificado─────────┘
```

**Regra dura: você não decide se elimina. Você executa a instrução do controlador e guarda a
prova de que ela existiu.** O registro do pedido no seu sistema **é** a instrução documentada
que o contrato de operador exige. O prazo legal corre para o **controlador**, contado do pedido
do titular: seu SLA contratual tem de ser estritamente menor que o dele, senão ele já está
atrasado no dia em que você entrega — e o prazo mora numa coluna (`prazo_em`), não num
parágrafo, porque coluna tem índice, alerta e teste. Quatro decisões de modelagem decidem se o
mecanismo funciona: **`subject_hash` em vez do e-mail** (hash com pepper de servidor, Parte
3.10), senão a tabela de pedidos vira o último lugar do banco onde o e-mail do eliminado
continua vivo; **`verificado_por` + `verificacao_metodo`**, porque você não confere a identidade
de quem não é seu usuário — registra que o controlador conferiu; **prévia obrigatória**, porque
com `GET /dsr/:id/previa` mais confirmação literal `{"confirmacao":"CONFIRMO_ELIMINACAO"}` a
execução é D2 e sem prévia seria D0 (a Parte 0.3 amarra o nível à irreversibilidade); e
**dicionário de campos na portabilidade**, sem o qual `custom.f_0012` não é interoperável com
nada.

**O que `test:erasure` precisa provar.** A Parte 3.9 avisa que deletar inclui backup, réplica,
cache e índice de busca. O aviso vira portão quando o inventário de stores é **arquivo
versionado** e o teste itera sobre ele:

```yaml
# docs/lgpd/inventario-pii.yaml
- store: postgres.contacts      {estrategia: hard_delete,       sonda: sql_conta}      # + filhos em cascata
- store: postgres.contact_notes {estrategia: texto_livre,       sonda: sql_ilike}
- store: postgres.audit_log     {estrategia: conservar_id}      # entity_id, nunca o e-mail
- store: search.contacts_idx    {estrategia: reindex_delete,    sonda: busca_por_termo}
- store: cache.redis            {estrategia: invalidate_prefix, sonda: keys_prefixo}
- store: storage.anexos         {estrategia: delete_objects,    sonda: lista_objetos}
- store: backup.pitr            {estrategia: expira_em_dias}    # replay de tombstone após restore
- store: subprocessadores       {estrategia: repassa_ordem}     # lista nominal do contrato
```

Quatro asserções: **(1)** todo store com `sonda` tem sonda implementada — inventário sem código
é documentação; **(2)** após a eliminação, toda sonda de store eliminável devolve zero; **(3)**
a trilha de auditoria **sobrevive**, sem o identificador em lugar nenhum dela; **(4)** **toda
tabela com coluna de PII está no inventário** — varre `information_schema.columns` e compara. A
quarta é o teste de *classe*, pela razão que faz o quarto teste de RLS ser o mais importante da
3.1: tabela nova criada por você ou pelo agente reprova o build no mesmo dia.

**O ponto cego que o campo customizado abre.** A quarta asserção cobre as colunas que **você**
declarou; campo customizado é PII que **o cliente** cria — ele batiza um texto de "CPF do
responsável" e há CPF em claro dentro de um `jsonb` que o inventário dá por resolvido.
Varredura por nome de definição acha candidatos, mas é heurística: **lista e para**, como a de
dedup. **Sem portão automático — revisão humana, nível D1.**

**Backup é o store onde a eliminação não é imediata.** Não existe `DELETE` dentro de um PITR. A
saída honesta tem três partes: declarar a janela do provedor no contrato; gravar **tombstone** —
linha que sobrevive à eliminação e guarda só `subject_hash`; e reaplicar os tombstones **após
qualquer restauração**, com ensaio periódico. O ensaio é **D1**: o agente roda em `--dry-run`,
que é o default, e você lê o relatório antes de fechar o ciclo.

**O caso sem portão: identificador em texto livre.** O e-mail do titular pode estar no corpo de
uma nota ("cliente pediu retorno em maria.silva@x.com"), num PDF anexo, num assunto
sincronizado. A varredura é automática; a decisão de apagar a nota — que também documenta uma
negociação e pode ser prova de outra obrigação — não é. **Sem portão automático — revisão
humana, nível D0.**

**Armadilha:** achar que soft delete resolve. `deleted_at` preenchido é linha com nome, e-mail
e telefone intactos — esconder da UI, não eliminar. São três verbos: `delete` (reversível na
janela), `purge` (o job converte o soft delete em remoção ao fim do prazo) e `erase` (o DSR
percorre o inventário e grava tombstone). O default do intake F2 vale para o primeiro; os
outros dois é o CRM que acrescenta. **Soft delete com prazo indefinido é retenção sem
finalidade declarada.**

### O tenant que cancela

O `erase` acima aplicado ao tenant inteiro. Cancelado o contrato, o dado dos contatos perde a
base legal — não no mesmo instante, porque existem arrependimento, disputa de cobrança e o
direito do controlador de levar o dado dele embora. Três marcos:

| Marco | O que acontece |
|---|---|
| Cancelamento | Escrita bloqueada, leitura mantida, exportação liberada, aviso com prazo |
| Fim da carência | App fecha; dado sai de toda query de produto; export ainda gerável por pedido |
| Expurgo (com aviso na véspera) | Remoção, tombstone gravado, certificado emitido ao controlador |

**Carência e expurgo são escolha sua e do contrato — não há padrão externo a copiar.** O que
não é escolha: eles moram numa coluna `jsonb` por tenant, não numa constante no código, porque
contrato negociado com cliente grande muda o número e não pode virar deploy. **Regra dura: todo
job com prazo recebe o "agora" como parâmetro — job que chama `now()` sozinho não tem teste, só
tem espera.** E o de expurgo roda com service role, que **pula RLS por definição**: as três
defesas são `dry_run` como **default** do parâmetro, trava percentual que recusa expurgo cujo
alcance excede a fatia declarada da base, e transação por tenant com contagem antes do commit.
Se ela for `SECURITY DEFINER`, valem as duas exigências da 3.1: `SET search_path` explícito e
entrada na lista justificada que `test:rls` confere.

---

## 8. Intake do perfil CRM

**CRM substitui perguntas, não acrescenta.** O total continua **45** e o teto de 5 por fase da
Parte 11.4 não se negocia. Três perguntas da Parte 2 cujo default virou constante saem — viram
linha no `CLAUDE.md` — e três entram no mesmo slot, aplicando o mecanismo da própria 11.4:
*pergunta que sempre recebe a mesma resposta não é pergunta, é fato*. As outras duas abaixo não
são novas: são perguntas que já existem, lidas com as apostas do perfil.

| # | Pergunta | Slot | Default se você não responder |
|---|---|---|---|
| 1 | O contato pertence ao tenant ou à plataforma? Algum caminho cruza tenants — dedup global, enriquecimento, sugestão, treino de modelo? | F1 #1 | **Nenhum.** Bloqueia |
| 2 | Qual a base legal e o prazo de retenção deste dado pessoal de terceiro? Por quais canais ele entra, e quem declara a base: você ou o tenant? | **substitui F2 #1** | **Nenhum.** Bloqueia |
| 3 | O tenant cria campos próprios? Pode criar campo de documento (CPF, RG, cartão) ou de dado sensível? | F2 #4 | `jsonb` com definições declaradas e validadas na borda por `test:input` (§2.3); nome reservado recusado por `CHECK`; campo com cara de documento vai para revisão humana, e trocar a arquitetura depois é migração de dado — ADR na F0 |
| 4 | Esta operação toca dado de titular em massa? Ela grava na trilha **antes** de responder? | **substitui F3 #5** | Sim para exportação e importação: gravação síncrona antes da resposta (seção 6) |
| 5 | Quem, dentro do tenant, pode ver e exportar este registro, e onde isso fica registrado? | **substitui F6 #1** | **Nenhum.** Bloqueia |

**Bloqueia?** As perguntas 1, 2 e 5. A **1** já bloqueia na Parte 11.5 (F1 #1) e aqui ganha
segunda razão: define se você é operador ou controlador, o que muda contrato antes de mudar
código — errar é vender um produto cuja operação normal é ilegal, e **nenhum portão pega isso
depois**. A **2** bloqueia porque proveniência é irreconstituível (seção 1); a **5**, porque
define o recorte da auditoria de leitura, que é D0. As duas últimas são os bloqueios que o CRM
acrescenta aos 9 do SAAS: **11 em 45**, como registra a 0.4.4. As 3 e 4 têm default
conservador: apertar demais custa reclamação de UX, afrouxar custa incidente.

---

## Armadilha de ambiente

Os portões deste perfil rodam em **Windows 11**. Todo script próprio é `.mjs` chamado por
`node scripts/x.mjs` — nunca `.sh`, nunca `./x.mjs`: o shebang não é executável no Windows e
Git Bash não é garantido no `PATH` (dicionário §5). Se algum `.sh` sobreviver no repositório,
trave `*.sh text eol=lf` no `.gitattributes` antes do primeiro commit; com CRLF o shebang vira
`/usr/bin/env bash\r`, o erro é `bad interpreter: ...^M` e ele não diz nada sobre a causa.
