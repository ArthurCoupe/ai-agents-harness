#!/usr/bin/env node
// instalar-harness.mjs — leva o harness de template-projeto/ (ao lado deste arquivo) para um projeto real.
//
// Node puro, zero dependencia, Windows 11 / Node v24. Nomes de portao, tiers e a composicao
// de `verify` vem do _DICIONARIO-CANONICO.md; este arquivo CITA, nunca redefine.
//
// Saidas: 0 = fez o que prometeu (instalou, ou emitiu o plano em --dry-run)
//         1 = parou e explicou por que.  Nunca um terceiro valor.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORDEM = ['SITE', 'APP', 'SAAS', 'CRM'];

// ---------------------------------------------------------------- ajuda ----
const AJUDA = `
instalar-harness.mjs — instala o harness de portoes num projeto que ja existe.

  node ${AQUI}\\instalar-harness.mjs <caminho-do-projeto> [opcoes]

OPCOES
  --dry-run            Mostra tudo que faria e nao escreve nada. COMECE POR AQUI.
  --perfil SITE|APP|SAAS|CRM
                       Pula a classificacao. Sem isso o instalador detecta por sinal
                       no codigo (dicionario secao 4) e pede confirmacao.
  --template <caminho> Origem alternativa (padrao: ${join(AQUI, 'template-projeto')}).
  --help               Isto.

O QUE ELE INSTALA
  .claude/hooks/       payload.mjs + os TRES hooks de limite: bloqueia-destrutivo,
                       protege-segredo, protege-catraca. Hook de PROCESSO nao entra:
                       ligado na semana 1 ele vira o que voce desliga (Parte 14 / 15.10).
  scripts/             profile-check, tree-check, hooks-check, headers-check (+ README).
  .claude/settings.json e CLAUDE.md  — so se ainda nao existirem (veja abaixo).
  .gitignore           Regras do harness (segredo: .env, chaves). Existindo, o .harness-novo e o seu
                       .gitignore inteiro com as regras que faltam no fim.
  .perfil              O perfil decidido, uma linha.

O QUE ELE NUNCA FAZ
  Sobrescrever arquivo diferente. Quando o destino ja existe e o conteudo difere, ele
  escreve <nome>.harness-novo ao lado e lista tudo no fim como merge manual.
  settings.json e CLAUDE.md caem quase sempre nesse caso — e o caminho normal.

DEPOIS DE INSTALAR
  Ele imprime o bloco de "scripts" do perfil para voce colar no package.json, diz quais
  portoes do perfil ainda nao tem script, e roda hooks:check no destino mostrando a saida
  real. hooks:check vermelho por "registrado em settings.json" significa que falta juntar
  os hooks ao seu settings.json — o .harness-novo ao lado tem o bloco pronto.

SAIDAS
  0  instalou (ou, em --dry-run, o plano saiu inteiro)
  1  parou e explicou por que
`;

// ------------------------------------------------------------ argumentos ----
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  console.log(AJUDA);
  process.exit(argv.length === 0 ? 1 : 0);
}

const SECO = argv.includes('--dry-run');
const pega = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const destinoArg = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--perfil' && argv[argv.indexOf(a) - 1] !== '--template');
const ORIGEM = resolve(pega('--template') ?? join(AQUI, 'template-projeto'));
let perfilArg = pega('--perfil')?.toUpperCase();

function parar(...linhas) {
  console.error('');
  for (const l of linhas) console.error(l);
  process.exit(1);
}

if (!destinoArg) parar('Falta o caminho do projeto.', `Uso: node ${AQUI}\\instalar-harness.mjs <projeto> --dry-run`);
if (perfilArg && !ORDEM.includes(perfilArg)) parar(`--perfil "${perfilArg}" nao existe. Use SITE, APP, SAAS ou CRM (dicionario secao 4).`);
const DESTINO = resolve(destinoArg);
if (!existsSync(ORIGEM)) parar(`Template ausente: ${ORIGEM}`, 'Use --template <caminho> para apontar outra origem.');

// ------------------------------------------------------ 1. o que existe ----
console.log(`\nharness  ${ORIGEM}\n     ->  ${DESTINO}${SECO ? '        [DRY-RUN: nada sera escrito]' : ''}`);
console.log('\n1. O QUE EXISTE');

if (!existsSync(DESTINO) || !statSync(DESTINO).isDirectory()) {
  parar(`   [x] ${DESTINO} nao existe, ou nao e diretorio.`, '   Crie o projeto antes. O instalador nao cria projeto.');
}
console.log('   [ok] diretorio');

const temGit = existsSync(join(DESTINO, '.git'));
console.log(temGit ? '   [ok] repositorio git' : '   [!]  sem .git — tree:check nao mede nada aqui. Crie com:  git init');

const ARQ_PKG = join(DESTINO, 'package.json');
let pkg = null;
if (existsSync(ARQ_PKG)) {
  try {
    pkg = JSON.parse(readFileSync(ARQ_PKG, 'utf8'));
    console.log(`   [ok] package.json (${Object.keys(pkg.scripts ?? {}).length} scripts)`);
  } catch (e) {
    console.log(`   [!]  package.json ilegivel: ${e.message}. O bloco de scripts sai mesmo assim, para colar a mao.`);
  }
} else {
  console.log('   [!]  sem package.json — nenhum portao tem onde morar. Crie com:  npm init -y');
}
console.log(`   [ok] node ${process.version}`);

// Gerenciador pelo lockfile, a mesma tabela da skill verificar-feature.
const LOCKFILES = [['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']];
const lock = LOCKFILES.find(([arq]) => existsSync(join(DESTINO, arq)));
const GERENCIADOR = lock ? lock[1] : 'npm';
console.log(`   [ok] gerenciador: ${GERENCIADOR}  (${lock ? `pelo lockfile ${lock[0]}` : 'sem lockfile, npm por padrao'})`);

// -------------------------------------------------------- 2. o perfil ----
// Espelho dos SINAIS de scripts/profile-check.mjs, traduzindo as tres perguntas do
// dicionario secao 4. Mudou la, muda aqui.
const SINAIS = {
  APP: [/supabase\.auth\./, /signInWith\w*\(/, /next-auth/, /jsonwebtoken/, /\b(bcrypt|argon2)\b/, /auth\.uid\(\)/],
  SAAS: [/\b(tenant_id|tenantId)\b/, /\b(organization_id|organizationId)\b/, /\b(workspace_id|workspaceId)\b/],
  CRM: [
    /create\s+table\s+(if\s+not\s+exists\s+)?[a-z_."]*\b(leads?|prospects?|contatos?|contacts?|oportunidades?|opportunities)\b/i,
    /\bimport_jobs?\b/,
  ],
};
// Planilha e CSV so contam junto de um sinal principal do mesmo perfil (SO_JUNTO no profile-check).
const SO_JUNTO = { CRM: [/\b(papaparse|csv-parse|csv-parser|xlsx|exceljs)\b/] };
const PERGUNTA = {
  APP: 'P1 alguem faz login (sessao de usuario)',
  SAAS: 'P3 clientes diferentes precisam ficar invisiveis um para o outro',
  CRM: 'P2 o dado principal e de pessoa que NAO usa o sistema',
};
const RAIZES = ['apps', 'packages', 'src', 'server', 'app', 'lib', 'api', 'supabase', 'prisma', 'db'];
const IGNORAR = new Set(['node_modules', 'dist', '.next', 'build', 'coverage', '.git', '.claude']);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.prisma']);

function varrer(dir, acc = []) {
  let ent;
  try { ent = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ent) {
    if (IGNORAR.has(e.name)) continue;
    const c = join(dir, e.name);
    if (e.isDirectory()) varrer(c, acc);
    else if (EXT.has(extname(e.name))) acc.push(c);
  }
  return acc;
}

console.log('\n2. PERFIL');
const evidencia = [];
const junto = [];
function casar(txt, onde, sinais, destino) {
  for (const [perfil, padroes] of Object.entries(sinais)) {
    for (const p of padroes) {
      const m = txt.match(p);
      if (m) destino.push({ perfil, onde, sinal: m[0] });
    }
  }
}
const alvos = RAIZES.flatMap((r) => varrer(join(DESTINO, r)));
for (const arq of alvos) {
  let txt;
  try { txt = readFileSync(arq, 'utf8'); } catch { continue; }
  const onde = arq.slice(DESTINO.length + 1).replace(/\\/g, '/');
  casar(txt, onde, SINAIS, evidencia);
  casar(txt, onde, SO_JUNTO, junto);
}
const deps = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }).join(' ');
casar(deps, 'package.json (dependencia)', SINAIS, evidencia);
casar(deps, 'package.json (dependencia)', SO_JUNTO, junto);
const comPrincipal = new Set(evidencia.map((e) => e.perfil));
evidencia.push(...junto.filter((e) => comPrincipal.has(e.perfil)));
const soAviso = junto.filter((e) => !comPrincipal.has(e.perfil));
if (soAviso.length) {
  console.log(`   aviso: ${soAviso.length} lugar(es) leem planilha ou CSV (ex.: ${soAviso[0].onde} -> "${soAviso[0].sinal}"). Sozinho nao e CRM: confira a P2.`);
}

const vistos = new Set();
for (const e of evidencia.slice(0, 12)) {
  const chave = `${e.perfil}:${e.sinal}:${e.onde}`;
  if (vistos.has(chave)) continue;
  vistos.add(chave);
  console.log(`   sinal de ${e.perfil.padEnd(4)}  ${e.onde}  ->  "${e.sinal}"    [${PERGUNTA[e.perfil]}]`);
}
if (evidencia.length === 0) console.log(`   nenhum sinal em ${alvos.length} arquivos lidos.`);

const detectado = evidencia.length
  ? evidencia.reduce((a, b) => (ORDEM.indexOf(a.perfil) > ORDEM.indexOf(b.perfil) ? a : b)).perfil
  : 'SITE';
console.log(`   -> detectado: ${detectado}  (mao unica: na duvida sobe. Descer e D0, com ADR — dicionario secao 4)`);

function perguntar(texto) {
  return new Promise((resolve_) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let feito = false;
    const fim = (v) => { if (!feito) { feito = true; try { rl.close(); } catch {} resolve_(v); } };
    rl.question(texto).then((r) => fim(String(r ?? '').trim())).catch(() => fim(null));
    rl.on('close', () => fim(null));
  });
}

let PERFIL = perfilArg ?? detectado;
if (perfilArg) {
  console.log(`   -> --perfil ${perfilArg}: classificacao pulada por sua ordem.`);
  if (ORDEM.indexOf(perfilArg) < ORDEM.indexOf(detectado)) {
    console.log(`   [!] ${perfilArg} e ABAIXO do detectado ${detectado}. Descer de perfil e D0 e pede ADR (dicionario secao 4).`);
    console.log(`       profile:check vai reprovar aqui ate o .perfil subir ou a excecao entrar em .perfil-excecoes.`);
  }
} else if (SECO) {
  console.log(`   -> em --dry-run nao pergunto nada: o plano abaixo usa ${detectado}.`);
} else {
  const r = await perguntar(`   Confirma ${detectado}? [Enter=sim / SITE|APP|SAAS|CRM] `);
  if (r === null) {
    parar(
      '   Sem resposta (stdin fechado) e sem --perfil: perfil e decisao D0, nao chute meu.',
      `   Rode de novo com:  node ${AQUI}\\instalar-harness.mjs "${DESTINO}" --perfil ${detectado}`,
    );
  }
  if (r !== '') {
    const escolhido = r.toUpperCase();
    if (!ORDEM.includes(escolhido)) parar(`   "${r}" nao e perfil. Use SITE, APP, SAAS ou CRM.`);
    if (ORDEM.indexOf(escolhido) < ORDEM.indexOf(detectado)) {
      console.log(`   [!] ${escolhido} e ABAIXO do detectado ${detectado}. Descer de perfil e D0 e pede ADR (dicionario secao 4).`);
    }
    PERFIL = escolhido;
  }
  console.log(`   -> confirmado: ${PERFIL}`);
}

// ------------------------------------------------------- 3. os arquivos ----
// Lista explicita. Um "copia tudo que parece hook" faz hook de processo entrar sozinho.
const HOOKS_DE_LIMITE = ['payload.mjs', 'bloqueia-destrutivo.mjs', 'protege-segredo.mjs', 'protege-catraca.mjs'];
const MANIFESTO = [
  ...HOOKS_DE_LIMITE.map((f) => [`.claude/hooks/${f}`, `.claude/hooks/${f}`]),
  ...['profile-check.mjs', 'tree-check.mjs', 'hooks-check.mjs', 'headers-check.mjs', 'README.md'].map((f) => [`scripts/${f}`, `scripts/${f}`]),
  ['.claude/settings.json', '.claude/settings.json'],
  ['CLAUDE.md', 'CLAUDE.md'],
];

const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
const merges = [];
const escritos = [];

function entregar(relDe, relPara, opcional = false) {
  const de = join(ORIGEM, relDe);
  const para = join(DESTINO, relPara);
  if (!existsSync(de)) {
    if (!opcional) console.log(`   FALTA  ${relDe} nao existe no template — pulado`);
    return;
  }
  const conteudo = readFileSync(de);
  if (existsSync(para)) {
    if (norm(readFileSync(para)) === norm(conteudo)) { console.log(`   igual  ${relPara}`); return; }
    const lado = `${relPara}.harness-novo`;
    console.log(`   MERGE  ${relPara} ja existe e difere  ->  ${lado}`);
    merges.push({ seu: relPara, novo: lado });
    if (!SECO) { mkdirSync(dirname(join(DESTINO, lado)), { recursive: true }); writeFileSync(join(DESTINO, lado), conteudo); }
    return;
  }
  console.log(`   novo   ${relPara}`);
  escritos.push(relPara);
  if (!SECO) { mkdirSync(dirname(para), { recursive: true }); writeFileSync(para, conteudo); }
}

// .gitignore do projeto sempre difere do template. Um .harness-novo com so as regras do
// template, renomeado por cima, apagaria o `.env` do ignore. Por isso o lado novo e o
// .gitignore do projeto inteiro com as regras que faltam no fim.
function entregarGitignore() {
  const de = join(ORIGEM, '.gitignore');
  if (!existsSync(de)) { console.log('   FALTA  .gitignore nao existe no template — pulado'); return; }
  const semBom = (t) => t.replace(/^﻿/, '');
  const regras = semBom(norm(readFileSync(de))).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const para = join(DESTINO, '.gitignore');
  if (!existsSync(para)) {
    console.log('   novo   .gitignore');
    escritos.push('.gitignore');
    if (!SECO) writeFileSync(para, readFileSync(de));
    return;
  }
  const atual = norm(readFileSync(para));
  const tem = new Set(semBom(atual).split('\n').map((l) => l.trim()));
  const faltam = regras.filter((r) => !tem.has(r));
  if (faltam.length === 0) { console.log('   igual  .gitignore (todas as regras do template presentes)'); return; }
  console.log(`   MERGE  .gitignore sem ${faltam.join(', ')}  ->  .gitignore.harness-novo (o seu inteiro + as regras que faltam)`);
  merges.push({ seu: '.gitignore', novo: '.gitignore.harness-novo' });
  if (!SECO) writeFileSync(`${para}.harness-novo`, `${atual.replace(/\n*$/, '\n')}\n# harness\n${faltam.join('\n')}\n`);
}

console.log('\n3. ARQUIVOS');
for (const [de, para] of MANIFESTO) entregar(de, para);
entregarGitignore();
// Opcional: so entra se o template ja o tiver.
entregar('package.scripts.json', 'package.scripts.json', true);

if (existsSync(join(DESTINO, '.claude', 'memory'))) {
  console.log('   AVISO  .claude/memory/ e de instalacao antiga: o harness nao usa mais. A remocao vai pelo fluxo do projeto.');
}

const extras = existsSync(join(ORIGEM, '.claude/hooks'))
  ? readdirSync(join(ORIGEM, '.claude/hooks')).filter((f) => f.endsWith('.mjs') && !HOOKS_DE_LIMITE.includes(f))
  : [];
for (const f of extras) console.log(`   pula   .claude/hooks/${f} — hook fora dos tres de limite nao entra na semana 1 (Parte 15.10)`);

// `.perfil` segue a mesma regra: nada some sem voce ver.
const ARQ_PERFIL = join(DESTINO, '.perfil');
if (existsSync(ARQ_PERFIL)) {
  const atual = readFileSync(ARQ_PERFIL, 'utf8').trim().toUpperCase();
  if (atual === PERFIL) console.log(`   igual  .perfil (${PERFIL})`);
  else {
    console.log(`   MERGE  .perfil ja diz ${atual}, decidimos ${PERFIL}  ->  .perfil.harness-novo`);
    merges.push({ seu: '.perfil', novo: '.perfil.harness-novo' });
    if (!SECO) writeFileSync(`${ARQ_PERFIL}.harness-novo`, `${PERFIL}\n`);
  }
} else {
  console.log(`   novo   .perfil (${PERFIL})`);
  escritos.push('.perfil');
  if (!SECO) writeFileSync(ARQ_PERFIL, `${PERFIL}\n`);
}

// --------------------------------------------- 4. o bloco do package.json ----
// Composicao de `verify` = dicionario secao 3. Trocamos so o runner (secao 1: o nome e a
// interface, o comando e a implementacao).
const R = `${GERENCIADOR} run`;
const CADEIA = {
  SITE: ['profile:check', 'lint', 'build', 'size:check', 'test:meta', 'links:check', 'bundle:scan'],
  APP: ['profile:check', 'lint', 'typecheck', 'test', 'build', 'size:check', 'test:authz', 'test:idor', 'bundle:scan'],
  SAAS: ['profile:check', 'lint', 'typecheck', 'test', 'build', 'size:check', 'test:authz', 'test:idor', 'test:input', 'test:logging', 'bundle:scan'],
  CRM: ['profile:check', 'lint', 'typecheck', 'test', 'build', 'size:check', 'test:authz', 'test:idor', 'test:input', 'test:logging', 'test:dedupe', 'bundle:scan'],
};
console.log(`\n4. COLE ISTO EM package.json -> "scripts"   (perfil ${PERFIL}, dicionario secao 3)`);
console.log('   "profile:check": "node scripts/profile-check.mjs",');
console.log('   "tree:check":    "node scripts/tree-check.mjs",');
console.log('   "hooks:check":   "node scripts/hooks-check.mjs",');
console.log('   "headers:check": "node scripts/headers-check.mjs",');
console.log(`   "verify":        "${CADEIA[PERFIL].map((n) => `${R} ${n}`).join(' && ')}"`);
console.log('   (o && vive dentro do package.json, onde o cmd.exe o entende — dicionario secao 5)');

// ------------------------------------------- 5. portoes ainda sem script ----
const OBRIG = {
  SITE: ['lint', 'build', 'test:a11y', 'size:check', 'test:meta', 'links:check', 'lh:check', 'secrets:scan', 'secrets:scan:full', 'bundle:scan', 'deps:check', 'headers:check', 'profile:check', 'tree:check', 'pr:check', 'hooks:check'],
  APP: ['typecheck', 'lint', 'test', 'build', 'test:authz', 'test:idor', 'test:auth', 'test:input', 'test:contract', 'test:logging', 'test:a11y', 'size:check', 'sast', 'secrets:scan', 'secrets:scan:full', 'bundle:scan', 'deps:check', 'headers:check', 'test:e2e', 'profile:check', 'tree:check', 'pr:check', 'hooks:check'],
  SAAS: ['typecheck', 'lint', 'test', 'build', 'test:authz', 'test:idor', 'test:rls', 'test:auth', 'test:input', 'test:contract', 'test:logging', 'test:a11y', 'sast', 'secrets:scan', 'secrets:scan:full', 'bundle:scan', 'deps:check', 'headers:check', 'test:e2e', 'profile:check', 'tree:check', 'pr:check', 'hooks:check'],
  CRM: ['typecheck', 'lint', 'test', 'build', 'test:authz', 'test:idor', 'test:rls', 'test:auth', 'test:input', 'test:contract', 'test:logging', 'test:erasure', 'test:import', 'test:dedupe', 'test:read-audit', 'test:a11y', 'sast', 'secrets:scan', 'secrets:scan:full', 'bundle:scan', 'deps:check', 'headers:check', 'test:e2e', 'profile:check', 'tree:check', 'pr:check', 'hooks:check'],
};
const ENTREGUES = ['profile:check', 'tree:check', 'hooks:check', 'headers:check'];
const jaTem = new Set(Object.keys(pkg?.scripts ?? {}));
const faltam = OBRIG[PERFIL].filter((n) => !jaTem.has(n));
console.log(`\n5. PORTOES DO PERFIL ${PERFIL} SEM SCRIPT (dicionario secao 2, so os obrigatorios)`);
if (faltam.length === 0) console.log('   nenhum. Os obrigatorios do perfil ja tem nome no package.json.');
else {
  const resolvidos = faltam.filter((n) => ENTREGUES.includes(n));
  const seus = faltam.filter((n) => !ENTREGUES.includes(n));
  if (resolvidos.length) console.log(`   o bloco acima resolve: ${resolvidos.join(', ')}`);
  if (seus.length) console.log(`   voce escreve:          ${seus.join(', ')}`);
  console.log('   Nome que nao se aplica ao seu caso EXISTE mesmo assim e sai 0 apontando a ADR:');
  console.log('   "script not found" e indistinguivel de setup quebrado (dicionario secao 1).');
}

// -------------------------------------------------- 6. hooks:check real ----
console.log('\n6. hooks:check  (portao dicionario secao 2.7 — implementacao: scripts/hooks-check.mjs)');
let hooksOk = null;
if (SECO) {
  console.log('   [dry-run] nada foi escrito; nada a rodar. Rode sem --dry-run e ele executa aqui.');
} else if (!existsSync(join(DESTINO, 'scripts', 'hooks-check.mjs'))) {
  console.log('   script ausente no destino — nada a rodar.');
} else {
  const r = spawnSync(process.execPath, [join(DESTINO, 'scripts', 'hooks-check.mjs')], { cwd: DESTINO, encoding: 'utf8' });
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd();
  for (const l of saida.split(/\r?\n/)) console.log(`   | ${l}`);
  hooksOk = r.status === 0;
  console.log(`   -> saiu ${r.status}`);
  if (!hooksOk) {
    console.log('   Vermelho em "registrado em settings.json" = os hooks existem mas nao estao ligados.');
    console.log('   Junte o bloco "hooks" de .claude/settings.json.harness-novo ao seu settings.json.');
  }
}

// ----------------------------------------------------------- 7. resumo ----
console.log(`\nRESUMO  ${SECO ? 'PLANO (nada escrito)' : 'INSTALADO'}  ·  perfil ${PERFIL}  ·  ${escritos.length} arquivo(s) novo(s)  ·  ${merges.length} merge(s) manual(is)`);
if (merges.length) {
  console.log('\nMERGE MANUAL — nada foi sobrescrito:');
  for (const m of merges) console.log(`   ${m.seu}   <-- junte a mao com -->   ${m.novo}`);
}
console.log('\nPROXIMO PASSO');
if (SECO) console.log(`   node ${AQUI}\\instalar-harness.mjs "${DESTINO}" --perfil ${PERFIL}`);
else if (merges.length) console.log(`   1) resolva os merges acima   2) cole o bloco da secao 4   3) ${R} hooks:check`);
else console.log(`   1) cole o bloco da secao 4 no package.json   2) ${R} hooks:check   3) ${R} verify`);

console.log('');
process.exit(0);
