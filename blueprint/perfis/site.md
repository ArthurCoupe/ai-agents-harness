# Perfil SITE

> Este arquivo **cita** o dicionário canônico e não redefine nada: nome de portão vem do §2,
> `verify` e tiers do §3, classificação do §4. Aqui só está o que muda quando não há banco seu.

Tirar o banco elimina as três falhas A01 da Parte 3 (RLS 3.1, authZ no cliente 3.2, IDOR 3.3):
elas não têm superfície aqui. Sobram duas, e entram três que a Parte 3 não cobre — cabeçalho de
resposta, terceiro no bundle e cadeia de publicação. Num SaaS existe alguma coisa entre o
atacante e o dado: banco, sessão, service. Num site estático não existe "entre". **Sem servidor
no meio, o que você controla é o que aquele HTML tem permissão de executar e para onde tem
permissão de falar.** Isso é CSP, e é por isso que ela deixa de ser reforço (o papel que tem na
Parte 3.5) e vira o controle principal.

---

## 1. Quando este é o seu perfil

O procedimento é o do dicionário §4, e só ele: **P1 — o sistema tem sessão de usuário, alguém
faz login? NÃO → SITE. Pare.** Institucional, landing, blog, portfólio, catálogo.

| Caso de fronteira | Perfil | Por quê |
|---|---|---|
| Formulário de contato, leads lidos por e-mail ou pelo Studio | **SITE** | A ferramenta de admin é de terceiro; não há superfície de leitura sua |
| Formulário + uma tela sua para ler os leads | **APP** | Essa tela tem login. P1 deu SIM no instante em que ela nasceu |
| Área do cliente, portal do aluno, "só um logininho" | **APP** no mínimo | Não existe SITE com login. Se dois clientes precisam ficar invisíveis um para o outro, P3 leva a SAAS |
| Blog em CMS headless: o editor loga no painel do fornecedor | **SITE** | A sessão é do fornecedor. Se você construir a tela de edição, vira APP |
| Formulário que grava numa tabela sua (Supabase) | **SITE**, com F2 | P1 continua NÃO — mas a tabela nasce destrancada (seção 2) |

**Mão única (§4):** na dúvida entre dois, escolha o mais alto — subir é acrescentar portão, descer
é decisão D0 com ADR. O perfil vive em `.perfil` na raiz e é o que `profile:check` lê
(`template-projeto/scripts/profile-check.mjs`): ele procura sinal de perfil **superior**
ao declarado, então a área logada que nasceu semana passada vira portão vermelho, não conversa.

---

## 2. Fases e nível D

Coluna SITE da matriz da Parte 0.4 — a comparação entre os quatro perfis está lá.

| Fase | SITE | Nota |
|---|---|---|
| **F0** Descoberta | D1 | Mapa de páginas, seções e CTAs. Errar custa reescrever uma página, não refazer schema |
| **F1** Spec e contratos | D1 | Critério de aceite por página; o contrato é o conteúdo |
| **F2** Modelagem de dados | (D1) | **Só existe se houver tabela sua.** Formulário que grava conta |
| **F3** Backend | (D2) | Só existe se houver código de servidor seu. Formulário direto para terceiro: não existe |
| **F4** Frontend | D2 | A fase principal deste perfil |
| **F5** Integração e E2E | D2 | Reduzida a smoke de rotas e `links:check` |
| **F6** Portão de segurança | D2 | Seção 4 deste arquivo |
| **F7** Observabilidade e release | D2 → D3 | Nasce D2. Nada nasce D3 (Parte 0.3), nem quando o deploy é um merge |
| **F8** Operação | D3 | Igual aos outros perfis |

**F2 e F3 normalmente não existem, e o dia em que passam a existir é o de maior risco do projeto:**
uma tabela `leads` criada no Studio nasce com RLS desligado e exposta pela API REST — o
CVE-2025-48757 da Parte 3.1 em miniatura. O portão desse dia é `test:input` (§2.3). **`test:rls`
não:** o §2.2 marca `—` na coluna SI, e portão que falta se acrescenta no dicionário antes de ser
usado. Trancar a tabela é D0 com ADR; no dia em que existir tela sua para ler o que ela guarda, o
§4 já respondeu qual é o perfil — e o portão de isolamento vem com ele.

---

## 3. `verify` e os tiers

**O `verify` do SITE está definido no dicionário §3 e em nenhum outro lugar.** Copie de lá para
o `package.json` e não o reescreva aqui nem no README: duas cópias de um comando é o defeito que
o dicionário existe para consertar. Tetos e ordem dos tiers: Parte 12.

| Grupo | Obrigatórios no SITE | Condicionais |
|---|---|---|
| Forma (§2.1) | `lint`, `build` | `typecheck`, `test` — só com TypeScript ou lógica própria |
| Entrada (§2.3) | — | `test:input` — só com formulário |
| Interface (§2.4) | `test:a11y`, `size:check`, `test:meta`, `links:check`, `lh:check` | — |
| Plataforma (§2.5) | `secrets:scan`, `secrets:scan:full`, `bundle:scan`, `deps:check`, `headers:check` | `sast` |
| Meta (§2.6) | `profile:check`, `pr:check`, `hooks:check` | `cost:check` |

Controle de acesso (§2.2), `test:contract` e `test:logging` saem com `—` nesta coluna, **e isso não
é motivo para apagar o script:** pelo corolário do §1 o nome existe e sai com 0 imprimindo a ADR que
justifica — `script not found` é indistinguível de setup quebrado. **`headers:check` nunca entra em
`verify`** (§3): cabeçalho só existe depois do deploy, então ele mora no tier 4, contra o preview.

---

## 4. Segurança do perfil

A Parte 3 inteira pressupõe banco. Sem ele, 3.1, 3.2 e 3.3 não têm superfície; 3.4 vira 4.4, 3.5
encolhe para um formulário em 4.2, 3.9 vale integralmente em 4.6, 3.10 pesa mais em 4.5, e entram
4.1, 4.3 e 4.7. **A leitura errada é concluir que um site sem `test:rls` vermelho não tem risco.**

### 4.1 Cabeçalhos e CSP — portão `headers:check`

Site estático na Vercel, Netlify ou Cloudflare Pages nasce com **zero** cabeçalho de segurança.
CSP não impede a injeção — impede a **execução** e a **exfiltração**. Um bloco, e é o inteiro:

```jsonc
// vercel.json na raiz. Em Netlify/Cloudflare Pages, os mesmos pares em public/_headers
{ "headers": [{ "source": "/(.*)", "headers": [
  { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests" },
  { "key": "Strict-Transport-Security", "value": "max-age=15552000" },
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
  { "key": "Permissions-Policy", "value": "geolocation=(), camera=(), microphone=(), payment=()" }
]}]}
```

`base-uri 'none'` é a mais esquecida e a que sustenta as outras: sem ela um `<base href>` injetado
reescreve todo caminho relativo e muda o que `'self'` significa. `form-action 'self'` impede
trocarem o destino do seu formulário sem tocar no HTML publicado.

**`'unsafe-inline'` em `script-src` anula a diretiva** — e é o valor que faz o site "voltar a
funcionar" em toda CSP copiada de tutorial. Build de Vite + React não precisa dele: os scripts saem
como arquivo com `src`. Em `style-src` o compromisso é aceitável, porque estilo não executa código.
E duas decisões apagam terceiros da CSP: proxiar o analytics pelo seu domínio (um `rewrite`) e
auto-hospedar as fontes (`@fontsource/*`), que ainda remove uma transferência de IP do visitante
para terceiro — dado pessoal que você teria que declarar em 4.6.

O portão é `headers:check` (§2.5), tier 4, escrito e medido em
`template-projeto/scripts/headers-check.mjs`. O mínimo de HSTS é **escolha do autor** —
180 dias, ajustável por `HSTS_MIN_AGE`. **Armadilha:** `includeSubDomains` derruba qualquer
subdomínio que ainda sirva HTTP pelo tempo do `max-age`, sem reversão do seu lado; suba em duas
etapas e deixe `preload` para depois.

### 4.2 Formulário — a única superfície dinâmica

Um formulário de contato é um endpoint público, sem autenticação, que aciona envio de e-mail e
consome cota paga. Três falhas, três defesas.

**(a) Injeção de cabeçalho de e-mail (CRLF)** — mecanismo, dano e as duas regras que fecham a
classe estão em `perfis/saas.md` §4.1 e valem aqui sem alteração. O portão é `test:input` (§2.3).

**(b) Rate limit sem backend seu.** O risco não é vazamento, é esgotamento de cota: o bot esgota o
plano, o formulário fica mudo, e o cliente descobre por reclamação. O limite que vale é o da
plataforma (Cloudflare, Vercel Firewall), que corta antes de custar invocação; contador em memória
na sua function é por instância, morre no cold start e só pega bot ingênuo. A cota do serviço de
formulário é teto de dano, não limite — saiba qual é o seu número.

**(c) Honeypot antes de captcha.** A ordem é honeypot → armadilha de tempo → rate limit da
plataforma → captcha. O honeypot é um campo visível no DOM e fora da tela (`left:-9999px`,
`tabIndex={-1}`, `aria-hidden`), nunca `type="hidden"` — o bot preenche `hidden` igual. Preenchido,
o servidor responde **204 como se tivesse dado certo**, porque 400 ensina o bot a reenviar vazio.
Captcha é último porque **abre a CSP para mais um host que executa script no seu domínio**: para
resolver 4.2 você agrava 4.3. O portão é `test:input` (§2.3, condicional — existe porque existe
formulário), que cobre CRLF, `.strict()` e limite de tamanho; honeypot no HTML publicado e filtros
ligados no painel do serviço de terceiro são **D0, revisão humana**.

**Regra dura:** nenhum campo vindo do formulário monta cabeçalho de e-mail.

### 4.3 Terceiro no bundle — a CSP é o inventário

`<script src="https://cdn.terceiro.example/widget.js">` não é dependência. É **concessão permanente
de execução de código arbitrário no domínio do seu cliente**, com acesso ao DOM, ao que a pessoa
digita no formulário e à rede, atualizável pelo terceiro sem passar pelo seu Git nem pelo seu CI. O
ataque canônico não altera o seu site: altera o script no CDN, e não há diff para você ver.

SRI (`integrity="sha384-…"` + `crossorigin`) congela os bytes e resolve o caso de biblioteca com
versão fixa na URL. **Armadilha:** SRI em `gtag.js`, script de chat ou pixel de anúncio quebra na
próxima atualização do fornecedor **e quebra em silêncio** — a coleta para e você descobre semanas
depois olhando gráfico zerado. Para esses, a decisão é não carregar, auto-hospedar um equivalente,
ou aceitar por escrito.

O ganho estrutural da 4.1 aparece aqui: **com a CSP apertada, adicionar um terceiro quebra o site
na hora**, e quem colou a tag precisa abrir um PR para liberar o host — adição silenciosa vira
falha visível, que é o que a Parte 3.0 diz faltar em segurança. Consequência: **a sua CSP é o
inventário de terceiros**, e a conferência é provar que os hosts do `dist/` cabem nos hosts da CSP.
Não há portão para isso no dicionário; enquanto não houver, é **D1** — o agente lista os hosts,
você aprova a diferença.

Gerenciador de tag é um buraco na CSP com nome bonito: autorizar `googletagmanager.com` em
`script-src` autoriza qualquer script que qualquer pessoa com a senha do container publique —
normalmente a agência do cliente. Ordem: analytics auto-hospedado sem cookie → fornecedor sem
gerenciador de tag → GTM com lista nomeada de acesso e ADR de risco aceito. **É D0.**

**Regra dura:** host de terceiro entra por PR que altera a CSP, nunca por tag colada no HTML.

### 4.4 Chave que é pública de propósito

O erro é tratar "está no bundle" como sinônimo de "vazou". A Parte 3.4 estabelece o mecanismo —
prefixo público vira texto literal no JavaScript — e o que falta é o critério.

> **Chave pública é protegida por restrição de origem e cota, não por sigilo. Se a chave não pode
> ser restringida por origem, ela não é pública — não importa o nome que o fornecedor deu.**

| Chave | Pública? | O que de fato a protege — a pergunta não é se ela aparece no DevTools |
|---|---|---|
| Supabase `anon` / publishable | Sim | **RLS, e só RLS** (Parte 3.1). Sem RLS, é uma base pública |
| Supabase `service_role` | **Não** | Sigilo. Ela ignora RLS por definição |
| Stripe `pk_live_` | Sim | Só cria token de pagamento, não move dinheiro |
| Google Maps (browser key) | Sim | Restrição por referenciador + cota, no console do fornecedor |
| Endpoint de formulário (Formspree, Web3Forms) | Sim | Allowlist de domínio no painel + cota. Sem ela, qualquer um consome a sua |
| `sk_live_`, `sk-…`, `re_…`, senha SMTP | **Não** | Sigilo. BFF (Parte 3.4) ou nada |

O artefato é `security/chaves-publicas.md` (§6 do dicionário): uma linha por variável, com a coluna
que importa — **o que a protege** e onde você aplicou a restrição. O portão é `bundle:scan` (§2.5);
e o bloqueio da F6 pergunta 4 deixa de ser "tem prefixo público" e passa a ser "existe variável
pública sem linha declarada", porque portão que dispara em todo build treina você a aprovar sem ler.

**Armadilha:** rotacionar uma chave pública que "vazou" não resolve nada — a nova vai para o mesmo
bundle amanhã. Se a chave de mapa está sendo abusada, a correção é restrição de origem e cota no
console do fornecedor; rotação é a correção da chave privada.

### 4.5 Dependência e template comprado

**Separe o que embarca do que só compila.** `deps:check` (§2.5) já é definido como "vulnerabilidade
alta em dependência **de produção**", e isso é deliberado: uma CVE no `vite` não chega ao navegador
do visitante. Varrer a árvore inteira de forma bloqueante produz fila permanente de achado
irrelevante, e em três semanas você acrescenta `|| true`. A árvore de build vai para o tier 5.

**Dependência de build compromete o site por outro caminho:** o script de ciclo de vida. Um pacote
comprometido roda `postinstall` na sua máquina Windows e no runner do CI, com as suas credenciais,
e injeta código em `dist/` depois do build. A defesa é lista fechada de pacotes autorizados a
executar código na instalação — `"pnpm": { "onlyBuiltDependencies": [...] }`.

**Template comprado** chega com JS minificado, plugin de jQuery antigo e às vezes um `mailer.php`
que continua acessível mesmo sem página apontando para ele. Três passos que produzem diff
auditável: ele entra **intocado, num commit só** (todo diff daqui em diante é seu); você apaga
pastas inteiras que não usa, porque apagar é o controle de segurança mais barato que existe; e os
achados de execução dinâmica (`eval`, `new Function`, `document.write`, `innerHTML =`) viram lista
que exige leitura — **D1**, o agente lista e explica, você aprova.

**Armadilha:** rodar o build do template com o `package.json` da pasta dele. Isso cria uma segunda
árvore de dependências, com lockfile próprio, que nenhum portão seu olha.

### 4.6 Dado pessoal sem banco

LGPD trata de **tratamento** — coleta, transmissão, armazenamento — e não exige banco. Um site
estático trata dado pessoal em três lugares: **analytics** (identificador, IP, comportamento),
**formulário** (nome, e-mail, telefone, às vezes CPF) e **log de acesso do host/CDN**. Nos três o
operador é um terceiro. IP é dado pessoal quando permite identificar o titular direta ou
indiretamente — art. 5º, I aplicado ao log de servidor.

**Consentimento é a pior escolha padrão**, e o reflexo é usá-lo para tudo: é a base mais frágil,
revogável a qualquer momento e com ônus de prova seu. Formulário de orçamento é art. 7º, V —
procedimentos preliminares de contrato, **a pedido do titular**; analytics agregado de primeira
parte é art. 7º, IX; log de acesso é segurança. **Consentimento fica para quando o dado sai do seu
domínio para um terceiro usar para os fins dele** (pixel de rede social, analytics com
identificador entre sites) e para newsletter. O critério é finalidade, não tecnologia: a LGPD não
tem a regra de cookie da ePrivacy europeia.

Quando o banner é necessário: nada pré-marcado (caixa marcada é ausência de ação); recusar no mesmo
nível de aceitar (se "Recusar" está atrás de "Gerenciar preferências", o desenho da tela é a
coação); e **nada que dependa de consentimento carrega antes da escolha** — a que esvazia o banner
na prática, porque o `gtag.js` já disparou enquanto ele renderizava. Essa terceira é a única
testável: entra no `test:e2e` do tier 4, contra a URL de preview, afirmando que nenhuma requisição
sai para host de terceiro antes do clique.

Base legal, aviso de privacidade e retenção são **D0**. Retenção é onde o SITE fica pior que o
SaaS: lá você escreve job de expurgo e teste (Parte 3.9); aqui o lead cai numa caixa de e-mail com
senha compartilhada e fica anos. O concreto é política escrita com prazo — o número é seu, mas
escrito — e tarefa recorrente que o executa. Se o volume passar disso, o formulário grava em tabela
sua e o problema vira o da Parte 3.9: **trocar D0 por D2 é motivo legítimo para introduzir banco.**

**Regra dura:** nada que dependa de consentimento faz requisição antes da escolha do visitante.

### 4.7 Integridade da publicação

Não há bug seu para explorar num site estático: o atacante não precisa de injeção, precisa de
**permissão de publicar**.

```
repositório → CI → token de deploy → DNS → registro do domínio
  ↑ onde todo mundo olha primeiro            ↑ onde quase ninguém olha
```

**A ordem de atenção é o inverso da ordem de impacto.** Quem controla o registro do domínio não
precisa do seu código: aponta o domínio para o servidor dele, tira certificado válido em minutos
(quem controla o DNS satisfaz o desafio ACME) e serve um clone com cadeado verde.

**Registro do domínio — D0, e é o item de maior impacto deste arquivo.** 2FA por TOTP, porque SMS
não conta: SIM swap é o ataque padrão contra domínio. Domínio no CNPJ do cliente, não no seu — na
conta da agência é ponto único de falha e problema jurídico quando a relação acaba. Renovação
automática, vencimento no calendário, trava de transferência, lista nomeada de quem tem acesso.

**DNS: CNAME órfão é tomada de subdomínio.** A campanha acabou, você apagou o projeto na plataforma
e esqueceu o registro DNS — agora qualquer pessoa cria um projeto com aquele nome, serve conteúdo
em `promo.cliente.com.br` com certificado válido e coloca cookie em `.cliente.com.br`, que o site
principal enxerga. **Apague o registro DNS antes do projeto na plataforma**, nunca o inverso.

**Token de deploy e repositório:** escopo de projeto, nunca de conta, como secret do CI; action de
CI fixada por SHA (Parte 3.10); proteção de branch em `main` **mesmo sendo solo**, porque a ameaça
não é você errar, é um token seu vazar. E **ninguém publica da máquina local** — um `vercel --prod`
contorna tudo isto de uma vez. Sem portão no dicionário para CNAME órfão, a conferência fica **D0**.

**Regra dura:** nenhuma publicação sai da máquina local; publicação é do CI.

---

## 5. Intake do SITE

**São 14 perguntas e um bloqueio.** O recorte está enumerado em 0.4.4 e é ele que vale; aqui só a
leitura de cada uma. O teto de 5 por fase da Parte 11.4 continua valendo: nada abaixo é uma sexta
pergunta, e o que sai vira `SUPOSIÇÃO:` declarada, não silêncio.

| Pergunta (0.4.4) | Leitura no SITE |
|---|---|
| F0 #4 e #5 | Termos do cliente; e o fora de escopo, a que mais economiza — sem ela o agente projeta blog, área do cliente e integração que ninguém pediu |
| F1 #5, mais a própria | Pronto é `pnpm verify` verde; a própria é a fonte da verdade do conteúdo (código ou CMS) e quais rotas são indexáveis |
| F2 #3 e #4 | Só se houver tabela sua. Nesse dia nascem F2 e `test:input` (seção 2) |
| F4 #1, #3, #4 e #5 | Frontend não muda por perfil |
| F5 #1 | Reduzida a smoke de rotas e `links:check` |
| F6 #4 e #5, mais a própria | #4 é **o único bloqueio do SITE**: barra até existir linha em `security/chaves-publicas.md` (4.4). #5 vira *entrou script de terceiro novo?* (4.3). A própria são os domínios de terceiro que a CSP libera, com portão `headers:check` (4.1) |
| F7 #1 e #5 | Formulário mudo por cota estourada é o caso comum (4.2) |

F3 não tem pergunta: sem servidor seu não há fase. Quem controla o registro do domínio e quem pode
publicar não é pergunta de intake — é o D0 da 4.7, respondido antes de existir repositório.

---

## 6. Armadilhas do perfil

**Armadilha (Windows):** no PowerShell, `curl` é alias de `Invoke-WebRequest` e não entende `-I`.
O comando copiado de tutorial falha com erro de parâmetro e você conclui que o servidor está
errado. Use `curl.exe -sSI https://www.cliente.com.br` — ou rode `headers:check`, que é Node puro
e não depende de qual `curl` ganhou o `PATH`.

**A leitura na vertical:** seis das sete superfícies da seção 4 valem integralmente para SAAS e
CRM. Elas não desaparecem quando existe banco — apenas param de ser as únicas. Um SaaS com RLS
perfeito e CSP com `'unsafe-inline'` tem um caminho de exfiltração que nenhum portão da §2.2
enxerga: o script injetado roda **como o usuário legítimo**, e o RLS entrega o dado para quem, do
ponto de vista do banco, tinha direito de ler.
