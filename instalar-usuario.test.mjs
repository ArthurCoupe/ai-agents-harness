#!/usr/bin/env node
// instalar-usuario.test.mjs - prova instalar-usuario.mjs num home falso e numa raiz falsa.
//
// Sem framework: cada verificacao imprime "ok   ..." ou "FALHA ...".
// Saidas: 0 = tudo passou . 1 = alguma falhou.  Nunca um terceiro valor.
//
// Nunca toca o ~/.claude real nem o usuario/ real do repo: copia o instalador para uma RAIZ
// falsa (com um usuario/ falso) num diretorio temporario e troca o home por USERPROFILE e
// HOME no ambiente do processo filho. Antes do primeiro caso, uma sonda confirma que o filho
// enxerga o home falso; se nao enxergar, o teste para sem rodar o instalador.
// Valor de segredo falso e sempre gerado em tempo de execucao, nunca escrito aqui.
//
// SABOTAGEM: cada caso traz "antes: ... depois: ..." - antes = instalador como esta, o caso
// passa; depois = com a mudanca descrita no instalador, o caso reprova.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'instalar-usuario-'));

let falhas = 0;
let total = 0;
function checar(ok, texto) {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
}

// ------------------------------------------------------------- montagem ----
const FRAG = {
  permissions: {
    additionalDirectories: ['{{HOME}}/notas'],
    deny: ['Bash(git commit *--no-verify*)', 'Bash(git push *--no-verify*)'],
    ask: ['Bash(git push *)'],
    defaultMode: 'acceptEdits',
  },
  hooks: {
    SessionStart: [{ matcher: 'startup|resume', hooks: [{ type: 'command', command: 'node {{HOME}}/.claude/hooks/aviso.mjs', timeout: 10 }] }],
    // O caso do graphify: binario no home que pode nao existir nesta maquina.
    PreToolUse: [{ matcher: 'Bash|Grep', hooks: [{ type: 'command', command: '{{HOME}}/.local/bin/graphify.EXE hook-guard search' }] }],
  },
  statusLine: { type: 'command', command: 'node {{HOME}}/.claude/status.mjs' },
  env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000' },
  enabledPlugins: { 'vercel@claude-plugins-official': false },
  extraKnownMarketplaces: { 'mercado-teste': { source: { source: 'git', url: 'https://exemplo.invalid/mercado.git' } } },
};
const USUARIO = {
  'CLAUDE.md': '# global\nregra um\n',
  'agents/revisor-teste.md': '---\nname: revisor-teste\n---\ncorpo\n',
  'skills/exemplo/SKILL.md': '---\nname: exemplo\n---\npassos\n',
  'hooks/aviso.mjs': 'process.exit(0);\n',
  'status.mjs': 'console.log("status");\n',
  // CRLF de proposito: a instalacao e byte a byte, o fim de linha nao pode mudar no caminho.
  'rules/crlf.md': 'linha um\r\nlinha dois\r\n',
  'settings.fragmento.json': `${JSON.stringify(FRAG, null, 2)}\n`,
};

function escrever(arq, conteudo) {
  mkdirSync(dirname(arq), { recursive: true });
  writeFileSync(arq, conteudo);
}

function montar(nome, homeRel = 'home') {
  const base = join(TMP, nome);
  const raiz = join(base, 'raiz');
  const home = join(base, homeRel);
  mkdirSync(join(raiz, 'usuario'), { recursive: true });
  mkdirSync(home, { recursive: true });
  copyFileSync(join(AQUI, 'instalar-usuario.mjs'), join(raiz, 'instalar-usuario.mjs'));
  for (const [rel, conteudo] of Object.entries(USUARIO)) escrever(join(raiz, 'usuario', rel), conteudo);
  return { raiz, home, homeFwd: home.replace(/\\/g, '/'), claude: join(home, '.claude'), usuario: join(raiz, 'usuario') };
}

// Variavel de ambiente no Windows nao diferencia maiuscula: tira qualquer grafia antes de por a nossa.
function ambiente(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(userprofile|home)$/i.test(k)) env[k] = v;
  env.USERPROFILE = home;
  env.HOME = home;
  return env;
}

function rodar(c, ...args) {
  const r = spawnSync(process.execPath, [join(c.raiz, 'instalar-usuario.mjs'), ...args], { env: ambiente(c.home), encoding: 'utf8' });
  return { status: r.status, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// Listagem e bytes de uma pasta inteira, para provar que nada mudou.
function foto(dir) {
  const out = {};
  const andar = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const c = join(d, e.name);
      const rel = relative(dir, c).split(sep).join('/');
      if (e.isDirectory()) { out[`${rel}/`] = ''; andar(c); } else out[rel] = readFileSync(c).toString('base64');
    }
  };
  if (existsSync(dir)) andar(dir);
  return JSON.stringify(Object.keys(out).sort().map((k) => [k, out[k]]));
}

const ler = (arq) => readFileSync(arq, 'utf8');
const lerJson = (arq) => JSON.parse(ler(arq));
const temBak = (dir) => foto(dir).includes('.bak');
const bytesIguais = (a, b) => existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));
const hojeTeste = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const aleatorio = (n, alfabeto = ALNUM) => [...randomBytes(n)].map((b) => alfabeto[b % alfabeto.length]).join('');

// --------------------------------------------------------------- sonda ----
// Se o filho nao enxergar o home falso, o instalador escreveria no ~/.claude real.
const sondaHome = join(TMP, 'sonda');
mkdirSync(sondaHome);
const sonda = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("node:os").homedir())'], { env: ambiente(sondaHome), encoding: 'utf8' });
if (sonda.stdout !== sondaHome) {
  console.log(`FALHA o processo filho nao enxerga o home falso (viu "${sonda.stdout}", esperado "${sondaHome}"): nada foi rodado`);
  rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
}

try {
  // ---- 0. argumentos -----------------------------------------------------
  // sabotagem: tirar a recusa de opcao desconhecida -> antes: ok; depois: FALHA em
  // "--dry-rum" (vira instalacao de verdade e o home muda).
  console.log('\n0. argumentos');
  const c0 = montar('c0');
  const antes0 = foto(c0.home) + foto(c0.usuario);
  let r = rodar(c0, '--help');
  checar(r.status === 0 && r.saida.includes('SAIDAS'), `--help: saiu ${r.status} (esperado 0) e mostra SAIDAS`);
  for (const [args, nome] of [
    [['--dry-rum'], '--dry-rum'],
    [['solto'], 'argumento solto'],
    [['--exportar'], '--exportar sem item'],
    [['--exportar', 'CLAUDE.md', '--sobrescrever'], '--exportar --sobrescrever'],
  ]) {
    r = rodar(c0, ...args);
    checar(r.status === 1 && foto(c0.home) + foto(c0.usuario) === antes0, `${nome}: saiu ${r.status} (esperado 1) e nada mudou`);
  }

  // ---- 1. instalar em home vazio ----------------------------------------
  // sabotagem: tirar a troca de {{HOME}} no instalador -> antes: ok; depois: FALHA em
  // additionalDirectories, no comando do hook e em "sem {{HOME}} literal".
  // Contar so existsSync na guarda de caminho (sem o NOVO do plano) -> depois: FALHA em
  // SessionStart e statusLine, que apontam para arquivos que a copia acabou de criar.
  console.log('\n1. instalar em home vazio');
  const c = montar('c1');
  r = rodar(c);
  checar(r.status === 0, `saiu ${r.status}, esperado 0`);
  for (const rel of Object.keys(USUARIO)) {
    checar(bytesIguais(join(c.usuario, rel), join(c.claude, rel)), `${rel}: copiado byte a byte`);
  }
  const arqSettings = join(c.claude, 'settings.json');
  checar(existsSync(arqSettings), 'settings.json criado');
  const textoSettings = existsSync(arqSettings) ? ler(arqSettings) : '';
  const s1 = textoSettings ? JSON.parse(textoSettings) : {};
  checar(isDeepStrictEqual(s1.permissions?.additionalDirectories, [`${c.homeFwd}/notas`]), 'additionalDirectories com {{HOME}} expandido (barra normal)');
  checar(s1.hooks?.SessionStart?.[0]?.hooks?.[0]?.command === `node ${c.homeFwd}/.claude/hooks/aviso.mjs`, 'hook SessionStart com {{HOME}} expandido (aviso.mjs veio na copia)');
  checar(s1.statusLine?.command === `node ${c.homeFwd}/.claude/status.mjs`, 'statusLine atribuido (status.mjs veio na copia)');
  checar(!textoSettings.includes('{{HOME}}'), 'settings.json sem {{HOME}} literal');
  checar(textoSettings === `${JSON.stringify(s1, null, 2)}\n`, 'settings.json com indentacao de 2 e quebra de linha final');
  checar(s1.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW === '400000' && s1.enabledPlugins?.['vercel@claude-plugins-official'] === false, 'env e enabledPlugins do fragmento');
  checar(isDeepStrictEqual(s1.extraKnownMarketplaces, FRAG.extraKnownMarketplaces), 'extraKnownMarketplaces do fragmento');
  checar(isDeepStrictEqual(s1.permissions?.ask, ['Bash(git push *)']) && s1.permissions?.defaultMode === 'acceptEdits', 'permissions.ask (lista) e permissions.defaultMode (escalar)');
  // sabotagem: tirar a guarda de caminho inexistente -> antes: ok; depois: FALHA aqui (o hook
  // do graphify entra apontando para binario que nao existe).
  checar(s1.hooks?.PreToolUse === undefined, 'hook do graphify fica de fora: o binario nao existe');
  checar(r.saida.includes(`pula   hooks.PreToolUse: ${c.homeFwd}/.local/bin/graphify.EXE nao existe nesta maquina`), 'relata o pula do hook com o caminho');

  // ---- 2. rodar de novo --------------------------------------------------
  // sabotagem: na uniao de permissions, acrescentar sem checar repeticao -> antes: ok;
  // depois: FALHA em deny sem duplicata, mesmos bytes e nenhum .bak.
  console.log('\n2. rodar de novo');
  const antesSettings = existsSync(arqSettings) ? readFileSync(arqSettings) : Buffer.alloc(0);
  r = rodar(c);
  checar(r.status === 0, `saiu ${r.status}, esperado 0`);
  checar(!/^\s+(NOVO|DIFERE|ATUALIZA)\s/m.test(r.saida), 'nenhum NOVO, DIFERE nem ATUALIZA');
  checar((r.saida.match(/^\s+IGUAL\s/gm) ?? []).length === Object.keys(USUARIO).length, `todos os ${Object.keys(USUARIO).length} arquivos IGUAL`);
  checar(r.saida.includes('settings.json: ja contem o fragmento'), 'settings.json: ja contem o fragmento');
  checar(existsSync(arqSettings) && readFileSync(arqSettings).equals(antesSettings), 'settings.json com os mesmos bytes');
  checar(!temBak(c.home), 'nenhum .bak criado');
  const s2 = existsSync(arqSettings) ? lerJson(arqSettings) : {};
  const deny2 = s2.permissions?.deny ?? [];
  checar(deny2.length === FRAG.permissions.deny.length && new Set(deny2).size === deny2.length, 'deny sem duplicata');
  checar((s2.hooks?.SessionStart ?? []).length === 1, 'hooks.SessionStart sem duplicata');

  // ---- 2b. o binario passa a existir --------------------------------------
  console.log('\n2b. o binario do hook passa a existir');
  escrever(join(c.home, '.local', 'bin', 'graphify.EXE'), 'binario falso\n');
  r = rodar(c);
  const s2b = lerJson(arqSettings);
  checar(r.status === 0 && r.saida.includes('muda   hooks.PreToolUse +1'), `rodar de novo acrescenta o hook: saiu ${r.status}, relata hooks.PreToolUse +1`);
  checar(s2b.hooks?.PreToolUse?.length === 1 && s2b.hooks.PreToolUse[0].hooks[0].command === `${c.homeFwd}/.local/bin/graphify.EXE hook-guard search`, 'hook do graphify agora registrado, uma vez');
  r = rodar(c);
  checar(r.status === 0 && r.saida.includes('settings.json: ja contem o fragmento'), 'terceira rodada: ja contem o fragmento');

  // ---- 3. arquivo diferente no home -------------------------------------
  // sabotagem: copiar DIFERE mesmo sem --sobrescrever -> antes: ok; depois: FALHA "fica
  // intacto". Fazer nomeBackup devolver sempre o mesmo nome (sem COPYFILE_EXCL) -> depois:
  // FALHA no nome exato do segundo backup, que apagaria o primeiro.
  console.log('\n3. arquivo diferente no home');
  const alvo3 = join(c.claude, 'agents', 'revisor-teste.md');
  const fonte3 = join(c.usuario, 'agents', 'revisor-teste.md');
  writeFileSync(alvo3, 'versao local\n');
  r = rodar(c);
  checar(r.status === 1, `sem --sobrescrever: saiu ${r.status}, esperado 1`);
  checar(ler(alvo3) === 'versao local\n', 'sem --sobrescrever: arquivo do home fica intacto');
  checar(/PENDENTE[\s\S]*agents\/revisor-teste\.md/.test(r.saida), 'sem --sobrescrever: listado como pendente');
  checar(/usuario\/ esta certo[\s\S]*--sobrescrever, que faz backup[\s\S]*~\/\.claude\/ esta certo: exporte/.test(r.saida), 'PENDENTE explica os dois lados (sobrescrever ou exportar)');
  r = rodar(c, '--sobrescrever');
  checar(r.status === 0, `com --sobrescrever: saiu ${r.status}, esperado 0`);
  const baks = () => readdirSync(join(c.claude, 'agents')).filter((f) => f.startsWith('revisor-teste.md.bak-')).sort();
  const primeiro = `revisor-teste.md.bak-${hojeTeste()}`;
  checar(isDeepStrictEqual(baks(), [primeiro]) && ler(join(c.claude, 'agents', primeiro)) === 'versao local\n', `com --sobrescrever: backup ${primeiro} com o conteudo antigo`);
  checar(bytesIguais(alvo3, fonte3), 'com --sobrescrever: destino igual a fonte');
  writeFileSync(alvo3, 'segunda local\n');
  r = rodar(c, '--sobrescrever');
  const segundo = `${primeiro}.2`;
  checar(r.status === 0 && isDeepStrictEqual(baks(), [primeiro, segundo]), `segundo --sobrescrever: backup com o nome exato ${segundo}`);
  checar(existsSync(join(c.claude, 'agents', segundo)) && ler(join(c.claude, 'agents', primeiro)) === 'versao local\n' && ler(join(c.claude, 'agents', segundo)) === 'segunda local\n', 'os dois backups com o conteudo certo, nenhum apagado');

  // ---- 3b. fragmento em ~/.claude diferente --------------------------------
  // sabotagem: tratar settings.fragmento.json como os demais (DIFERE) -> antes: ok;
  // depois: FALHA (saida 1 e pendente perpetuo).
  console.log('\n3b. settings.fragmento.json em ~/.claude diferente');
  const fragHome = join(c.claude, 'settings.fragmento.json');
  writeFileSync(fragHome, 'fragmento antigo\n');
  r = rodar(c);
  checar(r.status === 0 && /^\s+ATUALIZA\s+settings\.fragmento\.json/m.test(r.saida) && !r.saida.includes('PENDENTE'), `ATUALIZA sem --sobrescrever, nao conta como pendente: saiu ${r.status}`);
  checar(bytesIguais(fragHome, join(c.usuario, 'settings.fragmento.json')), 'fragmento em ~/.claude igual a fonte');
  const bakFrag = readdirSync(c.claude).filter((f) => f.startsWith('settings.fragmento.json.bak-'));
  checar(bakFrag.length === 1 && ler(join(c.claude, bakFrag[0])) === 'fragmento antigo\n', 'backup do fragmento antigo');

  // ---- 4. settings.json existente com chaves proprias --------------------
  // sabotagem: trocar a uniao de permissions por atribuicao (novo.permissions = fragmento)
  // -> antes: ok; depois: FALHA em deny (uniao) e allow preservado.
  console.log('\n4. settings.json existente com chaves proprias');
  const c4 = montar('c4');
  const proprio = {
    theme: 'dark',
    permissions: { allow: ['Bash(ls)'], deny: ['Bash(curl *)', 'Bash(git push *--no-verify*)'], defaultMode: 'default' },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node meu-hook.mjs' }] }] },
    env: { MINHA_VAR: 'x' },
    enabledPlugins: { 'vercel@claude-plugins-official': true, 'meu@plugin': true },
    extraKnownMarketplaces: { 'meu-mercado': { source: { source: 'git', url: 'https://exemplo.invalid/meu.git' } } },
  };
  const textoProprio = JSON.stringify(proprio, null, 4);
  escrever(join(c4.claude, 'settings.json'), textoProprio);
  r = rodar(c4);
  checar(r.status === 0, `saiu ${r.status}, esperado 0`);
  const s4 = lerJson(join(c4.claude, 'settings.json'));
  checar(s4.theme === 'dark', 'theme preservado');
  checar(isDeepStrictEqual(s4.permissions?.deny, ['Bash(curl *)', 'Bash(git push *--no-verify*)', 'Bash(git commit *--no-verify*)']), 'deny: existentes primeiro, novo no fim, sem repetir');
  checar(isDeepStrictEqual(s4.permissions?.allow, ['Bash(ls)']), 'allow preservado');
  checar(s4.permissions?.defaultMode === 'acceptEdits' && r.saida.includes('muda   permissions.defaultMode'), 'escalar em permissions (defaultMode): o fragmento vence e e relatado');
  checar(isDeepStrictEqual(s4.hooks?.PreToolUse, proprio.hooks.PreToolUse), 'hook proprio em PreToolUse preservado (graphify fica de fora)');
  checar((s4.hooks?.SessionStart ?? []).length === 1, 'hooks.SessionStart do fragmento acrescentado');
  checar(s4.env?.MINHA_VAR === 'x' && s4.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW === '400000', 'env proprio preservado e o do fragmento acrescentado');
  checar(s4.enabledPlugins?.['vercel@claude-plugins-official'] === false && s4.enabledPlugins?.['meu@plugin'] === true && r.saida.includes('muda   enabledPlugins.vercel@claude-plugins-official'), 'enabledPlugins: valor existente sobrescrito, o resto preservado');
  checar(isDeepStrictEqual(Object.keys(s4.extraKnownMarketplaces ?? {}), ['meu-mercado', 'mercado-teste']), 'extraKnownMarketplaces: o proprio preservado e o do fragmento acrescentado');
  checar(s4.statusLine?.command === `node ${c4.homeFwd}/.claude/status.mjs`, 'statusLine atribuido');
  checar(r.saida.includes('permissions.deny +1') && r.saida.includes('hooks.SessionStart +1'), 'relata permissions.deny +1 e hooks.SessionStart +1');
  const baks4 = readdirSync(c4.claude).filter((f) => /^settings\.json\.bak-\d{4}-\d{2}-\d{2}$/.test(f));
  checar(baks4.length === 1 && ler(join(c4.claude, baks4[0] ?? 'x')) === textoProprio, 'backup do settings.json com os bytes originais');

  // ---- 4b. hook quase igual: timeout mudado --------------------------------
  // sabotagem: voltar a deduplicar pelo JSON inteiro -> antes: ok; depois: FALHA (segunda
  // entrada de SessionStart com o timeout novo).
  console.log('\n4b. hook quase igual (timeout mudado)');
  const c4b = montar('c4b');
  const entradaVelha = { matcher: 'startup|resume', hooks: [{ type: 'command', command: `node ${c4b.homeFwd}/.claude/hooks/aviso.mjs`, timeout: 5 }] };
  escrever(join(c4b.claude, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [entradaVelha] } }, null, 2));
  r = rodar(c4b);
  const s4b = lerJson(join(c4b.claude, 'settings.json'));
  checar(r.status === 0 && s4b.hooks?.SessionStart?.length === 1 && s4b.hooks.SessionStart[0].hooks[0].timeout === 10, `entrada trocada no lugar, sem segunda: saiu ${r.status}, timeout ${s4b.hooks?.SessionStart?.[0]?.hooks?.[0]?.timeout}`);
  checar(r.saida.includes('muda   hooks.SessionStart (startup|resume)') && !r.saida.includes('hooks.SessionStart +'), 'relata muda hooks.SessionStart (startup|resume), sem +1');
  r = rodar(c4b);
  checar(r.status === 0 && r.saida.includes('settings.json: ja contem o fragmento'), 'rodar de novo: ja contem o fragmento');

  // ---- 4c. statusLine para arquivo que nao existe --------------------------
  console.log('\n4c. statusLine para arquivo que nao existe');
  const c4c = montar('c4c');
  writeFileSync(join(c4c.usuario, 'settings.fragmento.json'), `${JSON.stringify({ ...FRAG, statusLine: { type: 'command', command: 'node {{HOME}}/.claude/nao-existe.mjs' } }, null, 2)}\n`);
  r = rodar(c4c);
  const s4c = lerJson(join(c4c.claude, 'settings.json'));
  checar(r.status === 0 && s4c.statusLine === undefined, `statusLine nao atribuido: saiu ${r.status}`);
  checar(r.saida.includes(`pula   statusLine: ${c4c.homeFwd}/.claude/nao-existe.mjs nao existe nesta maquina`), 'relata o pula do statusLine com o caminho');

  // 4c2. marketplace de pasta: sem a pasta, sai ele e os plugins dele; com a pasta, entra.
  // sabotagem: tirar o bloco de extraKnownMarketplaces de semCaminhoAusente -> depois: FALHA
  // "marketplace ausente pulado".
  console.log('\n4c2. marketplace de pasta');
  const fragMods = (nome) => ({
    ...FRAG,
    enabledPlugins: { ...FRAG.enabledPlugins, [`m@${nome}`]: true },
    extraKnownMarketplaces: { ...FRAG.extraKnownMarketplaces, [nome]: { source: { source: 'directory', path: `{{HOME}}/.claude/${nome}` } } },
  });
  const c4m = montar('c4m');
  // Pasta "sem-pasta-outra" planejada nao valida "sem-pasta": a barra fecha a fronteira do prefixo.
  escrever(join(c4m.usuario, 'sem-pasta-outra', 'x.md'), 'x\n');
  writeFileSync(join(c4m.usuario, 'settings.fragmento.json'), `${JSON.stringify(fragMods('sem-pasta'), null, 2)}\n`);
  r = rodar(c4m);
  const s4m = lerJson(join(c4m.claude, 'settings.json'));
  checar(r.status === 0 && !s4m.extraKnownMarketplaces['sem-pasta'] && !('m@sem-pasta' in s4m.enabledPlugins) && s4m.extraKnownMarketplaces['mercado-teste'], `marketplace ausente pulado com o plugin dele, o resto fica: saiu ${r.status}`);
  const c4n = montar('c4n');
  escrever(join(c4n.usuario, 'com-pasta', '.claude-plugin', 'marketplace.json'), '{}\n');
  writeFileSync(join(c4n.usuario, 'settings.fragmento.json'), `${JSON.stringify(fragMods('com-pasta'), null, 2)}\n`);
  r = rodar(c4n);
  const s4n = lerJson(join(c4n.claude, 'settings.json'));
  checar(r.status === 0 && s4n.extraKnownMarketplaces['com-pasta']?.source.path === `${c4n.homeFwd}/.claude/com-pasta` && s4n.enabledPlugins['m@com-pasta'] === true, 'marketplace com a pasta copiada entra, com o caminho do home');

  // ---- 4d. hook que ganha (ou perde) um comando -----------------------------
  // sabotagem: voltar a identidade para "comandos iguais" -> antes: ok; depois: FALHA em
  // [a] -> [a, b] (segunda entrada) e em [a, b] -> [a].
  console.log('\n4d. hook que ganha ou perde um comando');
  const c4d = montar('c4d');
  for (const n of ['a', 'b', 'x']) escrever(join(c4d.claude, 'hooks', `${n}.mjs`), 'process.exit(0);\n');
  const cmd4d = (n) => `node ${c4d.homeFwd}/.claude/hooks/${n}.mjs`;
  const hook4d = (...ns) => ({ matcher: 'Write|Edit', hooks: ns.map((n) => ({ type: 'command', command: cmd4d(n) })) });
  const fragHook4d = (...ns) => `${JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write|Edit', hooks: ns.map((n) => ({ type: 'command', command: `node {{HOME}}/.claude/hooks/${n}.mjs` })) }] } }, null, 2)}\n`;
  const settings4d = join(c4d.claude, 'settings.json');
  const comandos4d = () => (lerJson(settings4d).hooks?.PreToolUse ?? []).map((e) => e.hooks.map((h) => h.command));
  writeFileSync(join(c4d.usuario, 'settings.fragmento.json'), fragHook4d('a', 'b'));
  escrever(settings4d, JSON.stringify({ hooks: { PreToolUse: [hook4d('a')] } }, null, 2));
  r = rodar(c4d);
  checar(r.status === 0 && isDeepStrictEqual(comandos4d(), [[cmd4d('a'), cmd4d('b')]]), `[a] -> [a, b]: trocado no lugar, sem segunda entrada (saiu ${r.status})`);
  checar(r.saida.includes('muda   hooks.PreToolUse (Write|Edit)') && !r.saida.includes('hooks.PreToolUse +'), 'relata muda hooks.PreToolUse (Write|Edit), sem +1');
  escrever(settings4d, JSON.stringify({ hooks: { PreToolUse: [hook4d('a', 'x')] } }, null, 2));
  r = rodar(c4d);
  checar(r.status === 0 && isDeepStrictEqual(comandos4d(), [[cmd4d('a'), cmd4d('x')], [cmd4d('a'), cmd4d('b')]]), `[a, x] contra [a, b]: acrescenta e preserva o x local (saiu ${r.status})`);
  checar(r.saida.includes('muda   hooks.PreToolUse +1'), 'relata hooks.PreToolUse +1');
  writeFileSync(join(c4d.usuario, 'settings.fragmento.json'), fragHook4d('a'));
  escrever(settings4d, JSON.stringify({ hooks: { PreToolUse: [hook4d('a', 'b')] } }, null, 2));
  r = rodar(c4d);
  checar(r.status === 0 && isDeepStrictEqual(comandos4d(), [[cmd4d('a')]]) && r.saida.includes('muda   hooks.PreToolUse (Write|Edit)'), `[a, b] -> [a] (fragmento perdeu um comando): trocado no lugar (saiu ${r.status})`);

  // ---- 4e. caminho com espaco, executavel sem extensao ---------------------
  // sabotagem: voltar o casamento para "ate o primeiro espaco" -> antes: ok; depois: FALHA
  // ("Projeto X" vira "Projeto", que nao existe). Tirar o PATHEXT -> depois: FALHA
  // (ferramenta sem .exe nao existe).
  console.log('\n4e. caminho com espaco e executavel sem extensao');
  const c4e = montar('c4e');
  escrever(join(c4e.home, 'Projeto X', 'h.mjs'), 'process.exit(0);\n');
  escrever(join(c4e.home, '.local', 'bin', 'ferramenta.exe'), 'binario falso\n');
  writeFileSync(join(c4e.usuario, 'settings.fragmento.json'), `${JSON.stringify({ hooks: { SessionStart: [
    { matcher: 'espaco', hooks: [{ type: 'command', command: 'node "{{HOME}}/Projeto X/h.mjs"' }] },
    { matcher: 'pathext', hooks: [{ type: 'command', command: '{{HOME}}/.local/bin/ferramenta --versao' }] },
    { matcher: 'ausente', hooks: [{ type: 'command', command: 'node {{HOME}}/.claude/nao-ha.mjs' }] },
  ] } }, null, 2)}\n`);
  r = rodar(c4e);
  const matchers4e = (lerJson(join(c4e.claude, 'settings.json')).hooks?.SessionStart ?? []).map((e) => e.matcher);
  checar(r.status === 0 && isDeepStrictEqual(matchers4e, ['espaco', 'pathext']), `entram o caminho entre aspas com espaco e a ferramenta.exe (saiu ${r.status}, entraram ${matchers4e.join(', ')})`);
  checar(!/pula\s+hooks\.SessionStart: .*(Projeto|ferramenta)/.test(r.saida), 'nenhum pula falso para "Projeto X" nem para ferramenta');
  checar(r.saida.includes(`pula   hooks.SessionStart: ${c4e.homeFwd}/.claude/nao-ha.mjs nao existe nesta maquina`), 'caminho inexistente continua pulando');

  // ---- 5. settings.json ou fragmento ilegivel ---------------------------
  // sabotagem: tratar settings.json ilegivel como {} -> antes: ok; depois: FALHA "arquivo
  // intacto" e "nada escrito" (o instalador gravaria por cima).
  console.log('\n5. settings.json ou fragmento ilegivel');
  const c5 = montar('c5');
  escrever(join(c5.claude, 'settings.json'), '{ "theme": "dark", isto nao e json');
  const antes5 = foto(c5.home);
  r = rodar(c5);
  checar(r.status === 1, `settings.json ilegivel: saiu ${r.status}, esperado 1`);
  checar(ler(join(c5.claude, 'settings.json')) === '{ "theme": "dark", isto nao e json', 'settings.json ilegivel: arquivo intacto');
  checar(foto(c5.home) === antes5, 'settings.json ilegivel: nada escrito no home');
  const c5b = montar('c5b');
  writeFileSync(join(c5b.usuario, 'settings.fragmento.json'), '{ "permissions": ');
  r = rodar(c5b);
  checar(r.status === 1, `fragmento ilegivel: saiu ${r.status}, esperado 1`);
  checar(foto(c5b.home) === '[]', 'fragmento ilegivel: home continua vazio');

  // ---- 6. --dry-run -------------------------------------------------------
  // sabotagem: ignorar --dry-run na fase de escrita -> antes: ok; depois: FALHA "home nao
  // muda" (os NOVO, o backup e o settings.json seriam gravados).
  console.log('\n6. --dry-run');
  const c6 = montar('c6');
  escrever(join(c6.claude, 'agents', 'revisor-teste.md'), 'local\n');
  escrever(join(c6.claude, 'settings.json'), '{"theme":"light"}');
  const antes6 = foto(c6.home);
  r = rodar(c6, '--dry-run');
  checar(r.status === 0, `saiu ${r.status}, esperado 0`);
  checar(foto(c6.home) === antes6, 'home nao muda (listagem e bytes)');
  checar(/^\s+NOVO\s/m.test(r.saida) && /^\s+DIFERE\s/m.test(r.saida) && /^\s+muda\s+permissions\.deny \+2/m.test(r.saida), 'plano mostra NOVO, DIFERE e o que muda no settings.json');
  checar(/^\s+muda\s+hooks\.SessionStart \+1/m.test(r.saida) && /^\s+muda\s+statusLine$/m.test(r.saida) && !/pula\s+(hooks\.SessionStart|statusLine)/.test(r.saida), 'o que o plano copiaria (NOVO) conta como existente');
  r = rodar(c6, '--dry-run', '--sobrescrever');
  checar(r.status === 0 && foto(c6.home) === antes6, '--dry-run --sobrescrever: saiu 0 e nenhum backup nem copia');

  // ---- 7. exportar --------------------------------------------------------
  console.log('\n7. exportar');
  // Home falso em .../Users/fulano: o nome do usuario e "fulano", como num home de verdade.
  const c7 = montar('c7', join('Users', 'fulano'));
  // 7a. CLAUDE.md: home vira ~, CRLF vira LF, sem diferenciar maiuscula.
  // sabotagem: tirar a flag "i" do regex do home -> antes: ok; depois: FALHA (a linha
  // "Caixa" sai com o caminho da maquina).
  escrever(join(c7.claude, 'CLAUDE.md'), `# global\r\nNotas: ${c7.home}\\notas\r\nOutro: ${c7.homeFwd}/notas\r\nCaixa: ${c7.homeFwd.toUpperCase()}/x\r\n`);
  r = rodar(c7, '--exportar', 'CLAUDE.md');
  checar(r.status === 0, `CLAUDE.md: saiu ${r.status}, esperado 0`);
  checar(ler(join(c7.usuario, 'CLAUDE.md')) === '# global\nNotas: ~\\notas\nOutro: ~/notas\nCaixa: ~/x\n', 'CLAUDE.md: caminho do home vira ~ e CRLF vira LF');
  checar(r.saida.includes('git diff -- usuario/'), 'manda revisar o diff');
  checar(r.saida.includes('Depois do merge, rode nesta maquina:') && r.saida.includes('--sobrescrever, para adotar a versao portavel (faz backup)'), 'manda esta maquina adotar a versao portavel depois do merge');

  // 7b. --dry-run nao grava.
  writeFileSync(join(c7.claude, 'CLAUDE.md'), '# mudou\n');
  let antes7 = foto(c7.usuario);
  r = rodar(c7, '--exportar', 'CLAUDE.md', '--dry-run');
  checar(r.status === 0 && foto(c7.usuario) === antes7, 'exportar --dry-run: saiu 0 e usuario/ nao muda');
  checar(!r.saida.includes('versao portavel'), 'sem troca de ~ nem de CRLF: nao manda adotar versao portavel');

  // 7c. item proibido: saida 1 e NADA gravado, nem o item valido que veio junto.
  // sabotagem: validar e gravar item por item -> antes: ok; depois: FALHA "nada gravado"
  // (CLAUDE.md seria gravado antes de chegar no item proibido).
  escrever(join(c7.claude, '.credentials.json'), '{"conteudo":"credencial-falsa-de-teste"}');
  mkdirSync(join(c7.claude, 'projects'), { recursive: true });
  escrever(join(c7.claude, 'settings.local.json'), '{}');
  for (const proibido of ['.credentials.json', 'projects', 'settings.local.json', 'plugins', '../fora', join(c7.claude, 'CLAUDE.md'), 'skills/../.credentials.json', 'CLAUDE.md/x']) {
    antes7 = foto(c7.usuario);
    r = rodar(c7, '--exportar', 'CLAUDE.md', proibido);
    checar(r.status === 1 && foto(c7.usuario) === antes7 && !r.saida.includes('credencial-falsa'), `item proibido "${proibido}": saiu ${r.status} (esperado 1) e nada gravado`);
  }

  // 7d. settings.json vira fragmento.
  // sabotagem: copiar env inteiro -> antes: ok; depois: FALHA "env so CLAUDE_CODE_*".
  // Tirar a troca da forma escapada de JSON -> depois: FALHA "home trocado por {{HOME}}".
  // Tirar a limpeza de allow/defaultMode -> depois: FALHA "permissions so deny, ask e
  // additionalDirectories". Tirar o AVISO de Users/<nome> -> depois: FALHA no AVISO.
  const valorEnv = `valor-que-nao-pode-aparecer-${randomBytes(6).toString('hex')}`;
  escrever(join(c7.claude, 'settings.json'), JSON.stringify({
    theme: 'dark',
    model: 'opus',
    permissions: { additionalDirectories: [`${c7.homeFwd}/notas`], deny: ['Bash(rm *)'], ask: ['Bash(git push *)'], allow: ['Bash(ls)'], defaultMode: 'acceptEdits' },
    hooks: { SessionStart: [{ matcher: 'startup', hooks: [
      { type: 'command', command: `node ${c7.homeFwd}/.claude/hooks/a.mjs` },
      { type: 'command', command: `node "${c7.home}\\.claude\\hooks\\b.mjs"` },
      { type: 'command', command: 'sh //c/Users/fulano/.claude/c.sh' },
    ] }] },
    statusLine: { type: 'command', command: `node ${c7.homeFwd}/.claude/status.mjs` },
    enabledPlugins: { 'x@y': true },
    env: {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000',
      CLAUDE_CODE_OUTRA: '1',
      CLAUDE_CODE_DIR_WIN: 'D:\\ferramentas',
      CLAUDE_CODE_DIR_POSIX: '/usr/local/x',
      CLAUDE_CODE_DIR_HOME: `--pasta=${c7.homeFwd}/x`,
      ANTHROPIC_BASE_URL: valorEnv,
      OUTRA: valorEnv,
    },
  }, null, 2).replace(/\n/g, '\r\n'));
  r = rodar(c7, '--exportar', 'settings.json');
  checar(r.status === 0, `settings.json: saiu ${r.status}, esperado 0`);
  const arqFrag = join(c7.usuario, 'settings.fragmento.json');
  const textoFrag = ler(arqFrag);
  const frag = JSON.parse(textoFrag);
  checar(isDeepStrictEqual(Object.keys(frag).sort(), ['enabledPlugins', 'env', 'hooks', 'permissions', 'statusLine']), 'fragmento so com as chaves permitidas (theme e model fora)');
  checar(isDeepStrictEqual(Object.keys(frag.permissions ?? {}).sort(), ['additionalDirectories', 'ask', 'deny']), 'permissions so deny, ask e additionalDirectories (allow e defaultMode fora)');
  checar(isDeepStrictEqual(frag.env, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000', CLAUDE_CODE_OUTRA: '1' }), 'env so CLAUDE_CODE_* que nao e caminho');
  const semHome = ![c7.homeFwd, c7.home, c7.home.replace(/\\/g, '\\\\')].some((f) => textoFrag.toLowerCase().includes(f.toLowerCase()));
  checar(semHome && frag.permissions?.additionalDirectories?.[0] === '{{HOME}}/notas' && frag.hooks?.SessionStart?.[0]?.hooks?.[1]?.command === 'node "{{HOME}}\\.claude\\hooks\\b.mjs"', 'home trocado por {{HOME}} (barra normal e barra invertida)');
  checar(textoFrag === `${JSON.stringify(frag, null, 2)}\n` && !textoFrag.includes('\r'), 'fragmento com indentacao de 2, LF e quebra de linha final');
  checar(/theme/.test(r.saida) && /ANTHROPIC_BASE_URL/.test(r.saida) && /OUTRA/.test(r.saida) && !r.saida.includes(valorEnv), 'lista pelo nome o que ficou fora, nunca o valor');
  checar(/permissions que sao estado desta maquina: allow, defaultMode/.test(r.saida), 'lista allow e defaultMode pelo nome');
  checar(/env com valor de caminho desta maquina \(so o nome\): CLAUDE_CODE_DIR_WIN, CLAUDE_CODE_DIR_POSIX, CLAUDE_CODE_DIR_HOME/.test(r.saida) && !r.saida.includes('ferramentas'), 'lista pelo nome o env com valor de caminho, sem o valor');
  checar(r.saida.includes('AVISO  settings.fragmento.json contem caminho desta maquina numa forma nao trocada: revise'), 'AVISO para //c/Users/<nome> que escapou das trocas');

  // 7d2. --exportar settings.json --dry-run nao grava.
  writeFileSync(arqFrag, 'fragmento do repo\n');
  antes7 = foto(c7.usuario);
  r = rodar(c7, '--exportar', 'settings.json', '--dry-run');
  checar(r.status === 0 && foto(c7.usuario) === antes7, '--exportar settings.json --dry-run: saiu 0 e nada gravado');

  // 7d3. segredo vindo do settings.json.
  // sabotagem: tirar a checagem de padrao sobre o fragmento -> antes: ok; depois: FALHA
  // (o fragmento sai com o token e saida 0).
  const jwt = `${'ey'}J${aleatorio(16)}.${aleatorio(16)}.${aleatorio(12)}`;
  escrever(join(c7.claude, 'settings.json'), JSON.stringify({ env: { CLAUDE_CODE_TOKEN: jwt } }));
  antes7 = foto(c7.usuario);
  r = rodar(c7, '--exportar', 'settings.json');
  checar(r.status === 1 && foto(c7.usuario) === antes7 && r.saida.includes('settings.json: casa o padrao de segredo JWT') && !r.saida.includes(jwt), `segredo no settings.json: saiu ${r.status} (esperado 1), nada gravado, so o nome do padrao`);

  // 7e. padroes de segredo no conteudo.
  // sabotagem: tirar qualquer padrao da lista (ex.: JWT) -> antes: ok; depois: FALHA no
  // arquivo daquele padrao (gravado em usuario/).
  const HEX = '0123456789abcdef';
  const FALSOS = [
    ['ghp_', () => `${'gh'}p_${aleatorio(36)}`],
    ['JWT', () => `${'ey'}J${aleatorio(16)}.${aleatorio(16)}.${aleatorio(12)}`],
    ['sbp_', () => `${'sb'}p_${aleatorio(24, HEX)}`],
    ['sk_live_ / sk_test_', () => `${'sk'}_live_${aleatorio(16)}`],
    ['sk-proj-', () => `${'sk'}-proj-${aleatorio(24)}`],
    ['AIza', () => `${'AI'}za${aleatorio(35)}`],
    // Senha com digito na frente: nunca comeca com "your" nem e senha de exemplo.
    ['credencial em URL', () => ['https:', '', `usuario:7${aleatorio(12)}@exemplo.invalid`, 'x'].join('/')],
    // Bearer so conta com digito no token: o 7 no fim garante.
    ['Bearer', () => `Authorization: ${'Bea'}rer ${aleatorio(23)}7`],
    ['BEGIN PRIVATE KEY', () => `${'-----BEGIN'} RSA ${'PRIVATE'} KEY-----\n${aleatorio(64, `${ALNUM}+/`)}\n-----END RSA ${'PRIVATE'} KEY-----`],
  ];
  const valores = FALSOS.map(([nome, gerar], i) => {
    const valor = gerar();
    escrever(join(c7.claude, 'hooks', `segredo-${i}.mjs`), `const v = '${valor}';\n`);
    return { nome, valor, arq: `segredo-${i}.mjs` };
  });
  // Nome de segredo: recusado pelo nome, mesmo com conteudo inofensivo.
  // sabotagem: tirar a recusa por nome -> antes: ok; depois: FALHA (.env e os demais vao
  // para usuario/).
  const NOMES = ['.env', '.env.local', '.envrc', 'servidor.pem', 'chave.key', 'id_rsa', 'id_ed25519.pub', 'credentials', 'credentials.json', '.credentials.json', 'Credentials.YML'];
  for (const n of NOMES) escrever(join(c7.claude, 'hooks', n), 'inofensivo\n');
  escrever(join(c7.claude, 'hooks', '.environment-notes.md'), 'nota\n');
  escrever(join(c7.claude, 'hooks', 'ok.mjs'), 'process.exit(0);\r\n');
  escrever(join(c7.claude, 'hooks', 'ok.sh'), 'echo ok\r\n');
  escrever(join(c7.claude, 'hooks', 'caminho.mjs'), `const p = '${c7.homeFwd}/x';\n`);
  // sabotagem: tirar a recusa de U+FFFD -> antes: ok; depois: FALHA (latin.md vai para
  // usuario/ com o acento trocado por U+FFFD).
  escrever(join(c7.claude, 'hooks', 'latin.md'), Buffer.from([0x63, 0x61, 0xe7, 0xe3, 0x6f, 0x0a]));
  escrever(join(c7.claude, 'hooks', 'velho.mjs.bak-2026-01-01'), 'velho\n');
  escrever(join(c7.claude, 'hooks', 'velho.mjs.harness-novo'), 'velho\n');
  escrever(join(c7.claude, 'hooks', 'node_modules', 'dep.js'), 'dep\n');
  r = rodar(c7, '--exportar', 'hooks');
  const uh = join(c7.usuario, 'hooks');
  checar(r.status === 1, `hooks com segredo: saiu ${r.status}, esperado 1`);
  for (const v of valores) {
    checar(!existsSync(join(uh, v.arq)) && r.saida.includes(`hooks/${v.arq}: casa o padrao de segredo ${v.nome}`) && !r.saida.includes(v.valor), `padrao ${v.nome}: recusado, cita so o nome do padrao`);
  }
  for (const n of NOMES) {
    checar(!existsSync(join(uh, n)) && r.saida.includes(`hooks/${n}: nome de arquivo de segredo`), `nome ${n}: recusado pelo nome`);
  }
  checar(existsSync(join(uh, '.environment-notes.md')), '.environment-notes.md nao e nome de segredo: exportado');
  checar(!existsSync(join(uh, 'latin.md')) && r.saida.includes('hooks/latin.md: nao e UTF-8'), 'texto que nao e UTF-8: recusado');
  checar(ler(join(uh, 'ok.mjs')) === 'process.exit(0);\n' && ler(join(uh, 'ok.sh')) === 'echo ok\n', 'arquivo limpo copiado, CRLF vira LF (.mjs e .sh)');
  checar(ler(join(uh, 'caminho.mjs')) === `const p = '${c7.homeFwd}/x';\n` && /AVISO\s+hooks\/caminho\.mjs contem caminho desta maquina: revise/.test(r.saida), 'fora de .md: copia sem trocar e avisa');
  checar(!existsSync(join(uh, 'velho.mjs.bak-2026-01-01')) && !existsSync(join(uh, 'velho.mjs.harness-novo')) && !existsSync(join(uh, 'node_modules')), '.bak-*, .harness-novo e node_modules pulados');
  // Pedido direto pelo nome tambem e recusado.
  antes7 = foto(c7.usuario);
  r = rodar(c7, '--exportar', 'hooks/.env');
  checar(r.status === 1 && foto(c7.usuario) === antes7 && r.saida.includes('hooks/.env: nome de arquivo de segredo'), `hooks/.env pedido direto: saiu ${r.status} (esperado 1) e nada gravado`);

  // 7g. exemplo de documentacao passa; segredo de verdade continua recusado.
  // sabotagem: afrouxar qualquer padrao de volta ao prefixo (sk_live_, sk-proj-, -----BEGIN,
  // Bearer sem digito, JWT de dois segmentos, AKIA sem a excecao EXAMPLE), tirar
  // ehPlaceholder ou voltar credentials* -> antes: ok; depois: FALHA no exemplo que passa.
  console.log('\n7g. exemplo de documentacao x segredo de verdade');
  const PASSAM = {
    'url-local.md': 'postgresql://postgres:postgres@localhost:5432/postgres',
    'url-placeholder.md': 'postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres',
    'url-variavel.md': 'postgresql://app:${DB_PASSWORD}@db.exemplo.com/app',
    'url-your.md': 'redis://default:yourpassword123@cache.exemplo.com:6379',
    'bearer-placeholder.md': 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY_HERE',
    'sk-live-sozinho.md': `use ${'sk'}_live_ em producao`,
    'sk-proj-sozinho.md': `chaves novas comecam com ${'sk'}-proj-`,
    'begin-public.md': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----',
    'akia-example.md': `aws_access_key_id = ${'AKIA'}IOSFODNN7EXAMPLE`,
    'jwt-sem-assinatura.md': `${'ey'}JhbGciOiJIUzI1NiJ9.${'ey'}JzdWIiOiJ1c3VhcmlvIn0.<assinatura>`,
    'credentials-rotation.md': 'como rotacionar credenciais\n',
  };
  const RECUSAM = [
    ['credencial em URL', () => ['postgresql:', '', `app:7${aleatorio(16)}@db.exemplo.com:5432`, 'prod'].join('/')],
    ['Bearer', () => `Authorization: ${'Bea'}rer ${aleatorio(23)}7`],
    ['sk_live_ / sk_test_', () => `${'sk'}_live_${aleatorio(24)}`],
    ['BEGIN PRIVATE KEY', () => `${'-----BEGIN'} ${'PRIVATE'} KEY-----\n${aleatorio(64, `${ALNUM}+/`)}\n-----END ${'PRIVATE'} KEY-----`],
  ].map(([nome, gerar], i) => ({ nome, valor: gerar(), arq: `recusa-${i}.md` }));
  for (const [arq, texto] of Object.entries(PASSAM)) escrever(join(c7.claude, 'rules', arq), `${texto}\n`);
  for (const v of RECUSAM) escrever(join(c7.claude, 'rules', v.arq), `${v.valor}\n`);
  r = rodar(c7, '--exportar', 'rules');
  checar(r.status === 1, `rules: saiu ${r.status}, esperado 1 (pelos recusados)`);
  for (const [arq, texto] of Object.entries(PASSAM)) {
    const ur = join(c7.usuario, 'rules', arq);
    checar(existsSync(ur) && ler(ur) === `${texto}\n` && !r.saida.includes(`rules/${arq}:`), `passa: ${arq}`);
  }
  for (const v of RECUSAM) {
    checar(!existsSync(join(c7.usuario, 'rules', v.arq)) && r.saida.includes(`rules/${v.arq}: casa o padrao de segredo ${v.nome}`) && !r.saida.includes(v.valor), `recusado: ${v.nome} de verdade (${v.arq})`);
  }

  // 7f. um item de cada pasta permitida.
  console.log('\n7f. exportar um item de cada pasta');
  const c7f = montar('c7f');
  const ITENS = {
    rules: 'rules/r.md',
    agents: 'agents/a.md',
    commands: 'commands/c.md',
    'output-styles': 'output-styles/o.md',
    hooks: 'hooks/h.mjs',
    'skills/x/SKILL.md': 'skills/x/SKILL.md',
  };
  for (const rel of Object.values(ITENS)) escrever(join(c7f.claude, rel), `conteudo de ${rel}\n`);
  escrever(join(c7f.claude, 'skills', 'x', 'extra.md'), 'nao pedido\n');
  for (const [item, rel] of Object.entries(ITENS)) {
    r = rodar(c7f, '--exportar', item);
    checar(r.status === 0 && existsSync(join(c7f.usuario, rel)) && ler(join(c7f.usuario, rel)) === `conteudo de ${rel}\n`, `--exportar ${item}: saiu ${r.status}, usuario/${rel} gravado`);
  }
  checar(!existsSync(join(c7f.usuario, 'skills', 'x', 'extra.md')), 'arquivo pedido direto leva so ele (extra.md fica)');

  // 7g. mods: a pasta inteira vai, e .ts/.tsx saem com LF como o resto do texto.
  // sabotagem: tirar mods de PERMITIDOS -> depois: FALHA (saida 1, item recusado).
  // Tirar .tsx de TEXTO -> depois: FALHA "register.tsx com LF".
  escrever(join(c7f.claude, 'mods', '.claude-plugin', 'marketplace.json'), '{"name":"mods"}\n');
  escrever(join(c7f.claude, 'mods', 'm', 'hooks', 'register.tsx'), 'linha 1\r\nlinha 2\r\n');
  r = rodar(c7f, '--exportar', 'mods');
  checar(r.status === 0 && existsSync(join(c7f.usuario, 'mods', '.claude-plugin', 'marketplace.json')), `--exportar mods: saiu ${r.status}, pasta oculta .claude-plugin gravada`);
  checar(ler(join(c7f.usuario, 'mods', 'm', 'hooks', 'register.tsx')) === 'linha 1\nlinha 2\n', '--exportar mods: register.tsx com LF');

  // ---- 8. ida e volta de hook com barra invertida ---------------------------
  // sabotagem: voltar a deduplicar pelo JSON inteiro -> antes: ok; depois: FALHA (o hook
  // volta do fragmento com C:/ e vira segunda entrada).
  console.log('\n8. ida e volta de hook escrito com barra invertida');
  const c8 = montar('c8');
  const cmdInvertida = `node ${c8.home.replace(/\//g, '\\')}\\.claude\\hooks\\b.mjs`;
  escrever(join(c8.claude, 'hooks', 'b.mjs'), 'process.exit(0);\n');
  escrever(join(c8.claude, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: cmdInvertida, timeout: 5 }] }] } }, null, 2));
  r = rodar(c8, '--exportar', 'settings.json');
  checar(r.status === 0 && lerJson(join(c8.usuario, 'settings.fragmento.json')).hooks?.SessionStart?.[0]?.hooks?.[0]?.command === 'node {{HOME}}\\.claude\\hooks\\b.mjs', `exportado com {{HOME}} e barra invertida: saiu ${r.status}`);
  r = rodar(c8);
  const s8 = lerJson(join(c8.claude, 'settings.json'));
  checar(r.status === 0 && s8.hooks?.SessionStart?.length === 1 && s8.hooks.SessionStart[0].hooks[0].command === cmdInvertida, `instalado de volta: saiu ${r.status}, uma entrada so, gravada como estava`);
  checar(r.saida.includes('settings.json: ja contem o fragmento') && !/pula\s+hooks/.test(r.saida), 'ja contem o fragmento (o caminho com barra misturada existe)');
} catch (e) {
  checar(false, `erro inesperado no teste: ${e?.stack ?? e}`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${total - falhas}/${total} verificacoes passaram`);
process.exit(falhas === 0 ? 0 : 1);
