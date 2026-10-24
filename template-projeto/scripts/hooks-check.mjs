#!/usr/bin/env node
// scripts/hooks-check.mjs   ->   portao `hooks:check` (dicionario 2.7)
//
// Prova o que o dicionario exige: "Todo hook responde certo nos tres casos, inclusive
// stdin `null`". Testar hook a mao nao escala e nao sobrevive a sexta-feira.
//
//   caminho feliz  -> 0
//   caso bloqueado -> 2
//   stdin `null`   -> depende da CLASSE do hook: fechado bloqueia (2), aberto libera (0)
//
// Um .mjs em .claude/hooks/ sem caso declarado aqui reprova o portao. Hook sem teste e
// hook que ninguem sabe se responde.
//
// Saidas: 0 = todos os casos passaram  ·  1 = qualquer caso falhou
//
// SABOTAGEM (guarda anti-vacuidade: guarda que nao executou nada e guarda vazia):
//   1. copia isolada (scratchpad) com `scripts/hooks-check.mjs` + `.claude/hooks/*.mjs`
//      e SEM `.claude/settings.json` (a RAIZ deste script e fixa: a pasta acima de
//      scripts/, entao o teste exige montar uma copia, nao passar argumento) -> antes:
//      saida 0, "SKIP ... nao existe: registro nao verificado". depois: saida 1,
//      "FAIL ... registro NAO verificado (nenhum hook provado ligado)".
//   2. `.claude/hooks/` ausente, ou presente sem nenhum `.mjs` -> ja reprovava
//      ("nenhum hook em ..."), saida 1; confirmado sem mudanca.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(join(AQUI, '..'));
const DIR_HOOKS = join(RAIZ, '.claude', 'hooks');

const bash = (cmd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } });
const escrita = (arq) => JSON.stringify({ tool_name: 'Write', tool_input: { file_path: arq } });

// Os quatro payloads ilegiveis compartilham um so sinal (payload.mjs devolve null para os
// quatro), entao a expectativa e a mesma: a da classe do hook.
const ILEGIVEIS = [
  ['stdin `null` literal', 'null'],
  ['stdin vazio', ''],
  ['JSON quebrado', '{"tool_input":'],
  ['array no lugar de objeto', '[]'],
];

const HOOKS = {
  'bloqueia-destrutivo.mjs': {
    classe: 'fechado',
    casos: [
      ['feliz: comando inofensivo', bash('pnpm test'), 0],
      ['feliz: --force-with-lease e a variante segura', bash('git push --force-with-lease origin feature/x'), 0],
      ['feliz: prisma migrate deploy', bash('pnpm prisma migrate deploy'), 0],
      ['bloqueado: prisma migrate reset', bash('pnpm prisma migrate reset --force'), 2],
      ['bloqueado: git push --force', bash('git push --force origin main'), 2],
      ['bloqueado: git push -f', bash('git push -f origin main'), 2],
      ['bloqueado: drop table', bash('psql -c "drop table clientes"'), 2],
      ['bloqueado: truncate', bash('psql -c "truncate table contatos"'), 2],
      ['bloqueado: git reset --hard', bash('git reset --hard origin/main'), 2],
      ['bloqueado: prisma migrate dev', bash('pnpm prisma migrate dev'), 2],
      ['bloqueado: prisma db push', bash('pnpm prisma db push'), 2],
      ['feliz: supabase db reset no banco local (padrao da CLI)', bash('supabase db reset'), 0],
      ['feliz: supabase db reset --local', bash('bunx supabase db reset --local'), 0],
      ['bloqueado: supabase db reset --linked', bash('supabase db reset --linked'), 2],
      ['bloqueado: supabase db reset --db-url', bash('npx supabase db reset --db-url postgresql://exemplo'), 2],
      ['bloqueado: reset remoto depois de um local no mesmo comando', bash('supabase db reset && supabase db reset --linked'), 2],
      ['bloqueado: rm -rf', bash('rm -rf ./dist'), 2],
      ['bloqueado: evento sem campo de comando', JSON.stringify({ tool_name: 'Bash', tool_input: {} }), 2],
    ],
  },
  'protege-segredo.mjs': {
    classe: 'fechado',
    casos: [
      ['feliz: arquivo de codigo', escrita('src/app/rotas.ts'), 0],
      ['feliz: .env.example carrega nome, nao valor', escrita('.env.example'), 0],
      ['feliz: .env.sample', escrita('.env.sample'), 0],
      ['feliz: .env.template', escrita('.env.template'), 0],
      ['feliz: .environment-notes.md nao e arquivo de ambiente', escrita('docs/.environment-notes.md'), 0],
      ['bloqueado: .env.local', escrita('.env.local'), 2],
      ['bloqueado: .env na raiz', escrita('.env'), 2],
      // .envrc (direnv) e .env-backup saiam 0 na primeira versao. Sao os dois arquivos que a
      // ampliacao do padrao fechou; sem estes dois casos, a brecha volta no proximo refactor.
      ['bloqueado: .envrc do direnv', escrita('.envrc'), 2],
      ['bloqueado: .env-backup', escrita('.env-backup'), 2],
      ['bloqueado: .pem', escrita('certs/servidor.pem'), 2],
      ['bloqueado: keystore .p12', escrita('certs/loja.p12'), 2],
      ['bloqueado: id_rsa', escrita('C:\\Users\\dev\\.ssh\\id_rsa'), 2],
      ['bloqueado: credentials.json', escrita('config/credentials.json'), 2],
      ['bloqueado: caixa alta nao contorna', escrita('.ENV.Production'), 2],
      ['bloqueado: evento sem campo de caminho', JSON.stringify({ tool_name: 'Write', tool_input: {} }), 2],
    ],
  },
  'protege-catraca.mjs': {
    classe: 'fechado',
    casos: [
      ['feliz: arquivo de codigo', escrita('src/dominio/contato.ts'), 0],
      ['feliz: package.json, onde o portao muda de estado', escrita('package.json'), 0],
      ['feliz: "baselines" em prosa nao e baseline', escrita('docs/baselines.md'), 0],
      ['bloqueado: .lintbaseline.json', escrita('.lintbaseline.json'), 2],
      ['bloqueado: baseline em subpasta', escrita('config/lint-baseline.json'), 2],
      ['bloqueado: baseline em txt', escrita('catraca/escapes-baseline.txt'), 2],
      ['bloqueado: qualquer coisa em .catraca/', escrita('.catraca/lint.json'), 2],
      ['bloqueado: caixa alta nao contorna', escrita('.LintBaseline.JSON'), 2],
      ['bloqueado: evento sem campo de caminho', JSON.stringify({ tool_name: 'Write', tool_input: {} }), 2],
    ],
  },
};

const ESPERADO_ILEGIVEL = { fechado: 2, aberto: 0 };

let falhas = 0;
let total = 0;

function relatar(ok, texto) {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${texto}`);
}

function rodar(caminho, entrada) {
  const r = spawnSync(process.execPath, [caminho], { input: entrada, encoding: 'utf8' });
  return r.status;
}

// ---- 1. todo hook do diretorio tem caso declarado --------------------------
// `payload.mjs` mora aqui por definicao (dicionario secao 6): os hooks importam
// `./payload.mjs`, entao ele fica ao lado deles. Nao e hook — nao le stdin sozinho, nao tem
// codigo de saida proprio. A lista de helpers e EXPLICITA e curta de proposito: um "pula
// arquivo que nao parece hook" por heuristica e como um hook de verdade some do portao.
const HELPERS = new Set(['payload.mjs']);

const presentes = existsSync(DIR_HOOKS)
  ? readdirSync(DIR_HOOKS).filter((f) => f.endsWith('.mjs') && !HELPERS.has(f))
  : [];

if (presentes.length === 0) {
  console.error(`hooks:check: nenhum hook em ${DIR_HOOKS}`);
  process.exit(1);
}

for (const arquivo of presentes) {
  relatar(arquivo in HOOKS, `${arquivo}: tem casos declarados em hooks-check.mjs`);
}

// ---- 2. os casos -----------------------------------------------------------
for (const [arquivo, { classe, casos }] of Object.entries(HOOKS)) {
  const caminho = join(DIR_HOOKS, arquivo);
  console.log(`\n${arquivo}  (limite ${classe})`);

  if (!existsSync(caminho)) {
    relatar(false, `${arquivo}: declarado aqui mas ausente em .claude/hooks/`);
    continue;
  }

  for (const [nome, entrada, esperado] of casos) {
    const saiu = rodar(caminho, entrada);
    relatar(saiu === esperado, `${nome}: saiu ${saiu}, esperado ${esperado}`);
  }

  const esperadoIlegivel = ESPERADO_ILEGIVEL[classe];
  for (const [nome, entrada] of ILEGIVEIS) {
    const saiu = rodar(caminho, entrada);
    relatar(saiu === esperadoIlegivel, `${nome}: saiu ${saiu}, esperado ${esperadoIlegivel} (${classe})`);
  }
}

// ---- 3. registro no harness ------------------------------------------------
// Hook desregistrado e hook que nao roda. O portao ate aqui so prova que o ARQUIVO do hook
// responde certo — nunca que ele esta ligado no harness (blueprint 15.10). Sem settings.json
// nao ha como provar isso, e SKIP com saida 0 escondia essa lacuna: 53/53 verde com nenhum
// hook realmente registrado. Agora falta de settings.json e FAIL, nao SKIP.
console.log('\nregistro no harness');
const SETTINGS = join(RAIZ, '.claude', 'settings.json');
if (!existsSync(SETTINGS)) {
  relatar(false, `${SETTINGS} nao existe: registro NAO verificado (nenhum hook provado ligado)`);
} else {
  // Buscar so pelo NOME do arquivo era falso verde. Provado: um settings.json apontando para
  // uma pasta que NAO existe — nenhum hook rodando, nenhuma protecao ativa — passava com
  // 56/56 e saida 0, porque o nome do arquivo aparecia na string. O portao dizia verde no
  // unico caso que ele existe para pegar.
  // Agora todo caminho .mjs citado no settings.json e RESOLVIDO no disco.
  let comandos = [];
  try {
    const hooks = JSON.parse(readFileSync(SETTINGS, 'utf8')).hooks ?? {};
    comandos = JSON.stringify(hooks).match(/[^"'\s]+\.mjs/g) ?? [];
  } catch (e) {
    relatar(false, `settings.json ilegivel: ${e?.message ?? e}`);
  }

  // ${CLAUDE_PROJECT_DIR} (ou $CLAUDE_PROJECT_DIR) e a forma que a documentacao de hooks
  // recomenda: o harness troca pela raiz do projeto, e o hook roda de qualquer subpasta. Caminho
  // relativo quebra quando o terminal sai da raiz, e a saida 1 do node nao bloqueia nada.
  // Expandir aqui; sem isso o caminho com a variavel nunca resolve e o portao reprova o certo.
  const expandir = (c) => c.replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR/g, RAIZ);

  // Todo caminho .mjs citado no settings.json tem que existir. Um que nao existe e um hook
  // silenciosamente morto — pior que hook ausente, porque parece configurado.
  for (const cmd of comandos) {
    const alvo = resolve(RAIZ, expandir(cmd));
    relatar(existsSync(alvo), `caminho registrado existe no disco: ${cmd}`);
  }

  // Caminho relativo resolve no disco a partir da RAIZ e passava acima, mas o agente roda
  // o hook na pasta atual da sessao: depois de um cd para subpasta o node nao acha o arquivo,
  // sai 1, e saida 1 nao bloqueia nada. Provado num projeto real em 2026-10-05.
  for (const cmd of comandos) {
    const fixo = /\$\{?CLAUDE_PROJECT_DIR\}?/.test(cmd) || isAbsolute(cmd);
    relatar(fixo, `caminho registrado nao depende da pasta atual (use \${CLAUDE_PROJECT_DIR}): ${cmd}`);
  }

  for (const arquivo of Object.keys(HOOKS)) {
    const casa = comandos.filter((c) => c.endsWith(`/${arquivo}`) || c.endsWith(`\\${arquivo}`));
    const valido = casa.some((c) => existsSync(resolve(RAIZ, expandir(c))));
    relatar(valido, `registrado em settings.json e resolve no disco: ${arquivo}`);
  }
}

console.log(`\n${total - falhas}/${total} casos passaram`);
process.exit(falhas === 0 ? 0 : 1);
