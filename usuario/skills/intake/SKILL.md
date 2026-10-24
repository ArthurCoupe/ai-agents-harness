---
name: intake
description: Levantamento obrigatório antes de implementar. Use antes da primeira linha de código de feature nova sem spec, quando o pedido tem mais de uma interpretação, ou quando você percebe que ia "assumir" algo estrutural. Produz docs/specs/<feature>/intake.md com respostas, SUPOSICAO: e PENDENTE:, e PARA quando sobra pendência bloqueante.
---

# intake

> **Não peça "pergunte quando estiver ambíguo" — entregue o inventário de perguntas.**

O agente não detecta a própria ambiguidade. Ausência de dúvida não é sinal de clareza: quem usa IA
escreve código menos seguro **e acredita mais** que está seguro. Por isso o inventário é fixo e
curto — você não julga *se* deve perguntar; preenche um formulário de cinco campos.

## 1. Perfil e fase

Perfil: leia `.perfil` na raiz. Sem o arquivo, as três perguntas de
`blueprint/_DICIONARIO-CANONICO.md` §4 (no repositório do harness), nesta ordem: login? (NÃO → SITE) → o dado
principal é de pessoa que não usa o sistema? (SIM → CRM) → clientes invisíveis entre si?
(SIM → SAAS, NÃO → APP). Na dúvida, o mais alto; siga com **APP** declarando
`SUPOSICAO: perfil APP, .perfil ausente`.
Fase: o que esta tarefa produz. F0 domínio · F1 spec e contratos · F2 dados e migration ·
F3 backend · F4 frontend · F5 integração e E2E · F6 segurança · F7 release · F8 operação.
Use o inventário **daquela fase**, na Parte 2 do blueprint
(`blueprint/blueprint-sdlc-agent-ready.md` no repositório do harness, linhas 309–756): cinco perguntas com
coluna de default.

**Mockup aprovado (projeto de cliente).** Procure antes de perguntar: `docs/mockup/` e
`git tag -l "mockup-aprovado-v*"`. Se não houver, a primeira pergunta da rodada é "Existe
mockup aprovado pelo cliente? Onde está o arquivo?". Com o arquivo em mãos, confira que só tem
dado fictício. Se houver dado real (nome, e-mail, CPF, telefone de pessoa de verdade), PARE:
não grave nem marque a tag; peça ao cliente uma versão com dado fictício. Só fictício: grave em `docs/mockup/` e registre que o commit e a tag `mockup-aprovado-v1`
são do orquestrador. A versão tagueada não é editada: mudança pedida pelo cliente vira `v2`.
Do mockup saem, para este intake: telas, entidades e campos, ações (cada botão vira caso de
uso ou rota) e matriz de acesso (quem vê e quem edita cada tela). Resposta "não há mockup"
vira `SUPOSICAO: sem mockup aprovado — escopo só pelo pedido`.

## 2. Como perguntar

- **Máximo 5 perguntas, uma rodada.** Agrupe, não interrogue. Quinze perguntas viram "sim"
  em bloco: consentimento sem leitura, com aparência de alinhamento.
- **Sempre com o default recomendado e a justificativa.** "Vou assumir X porque Y —
  confirma?" é melhor que "o que você quer aqui?".
- **Não pergunte o que dá para ler do repositório.** Stack, convenção, validador já usado,
  padrão de erro: vira `SUPOSICAO:` declarada. Pergunta gasta o orçamento de atenção que você
  precisava para a de isolamento de dado.
- Pergunte só o que, se errado, **custa refatoração**. O resto você decide e declara.

## 3. Quanto cada perfil pergunta e quanto bloqueia

| Perfil | Perguntas no total | Bloqueios |
|---|:--:|:--:|
| SITE | 14 | 1 |
| APP | 36 | 6 |
| SAAS | 45 | 9 |
| CRM | 45 | 11 |

SAAS é a base (5 × 9 fases). Bloqueiam: **as cinco de F0** (nenhuma tem default), **F1 #1 e
#2** (controle de acesso — nenhum portão pega depois), **F2 #5** com migration destrutiva,
**F6 #4** segredo com prefixo público. O único bloqueio do SITE é F6 #4 — é o erro que já
nasce publicado: `VITE_RESEND_API_KEY` numa landing é tão irrecuperável quanto num CRM. No
CRM, as substitutas de F2 e F6 (base legal e retenção do dado de terceiro; quem dentro do
tenant pode ver o registro) também bloqueiam.

## 4. Saída — `docs/specs/<feature>/intake.md`

```markdown
# intake — <feature>
PERFIL: <SITE|APP|SAAS|CRM>   FASE: <F0..F8>

## Perguntas
1. <pergunta> — default proposto: <X> porque <Y>
   RESPOSTA: <o que o usuário respondeu>

## Suposições
SUPOSICAO: <decisão> — base: <arquivo/convenção que li no repositório>

## Pendências
PENDENTE: <o que ficou sem resposta>  [bloqueante: sim|não]
```

## 5. Quando parar

**Se sobrar `PENDENTE:` num item bloqueante da fase, PARE.** Não implemente, não "comece pelo
que dá", não escolha um default. Esses itens não têm portão automático a jusante — a resposta
humana **é** o portão. `PENDENTE:` não-bloqueante segue: fica no arquivo e aparece no review.

## 6. O inventário é vivo

Resposta igual cinco vezes vira linha do `CLAUDE.md` e sai do inventário; incidente na F8 vira
pergunta nova e entra. Inventário que nunca muda não aprendeu nada com o seu domínio.
**Sem `docs/specs/` no projeto:** crie o caminho ao gravar. Sem a Parte 2 acessível, derive as
cinco da fase e declare `SUPOSICAO: inventário derivado, Parte 2 não lida`.
