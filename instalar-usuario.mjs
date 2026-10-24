#!/usr/bin/env node
// instalar-usuario.mjs - leva a camada de usuario do Claude Code de usuario/ (neste repositorio) para
// ~/.claude (CLAUDE.md global, rules, hooks, agents, skills, mods e o fragmento do settings.json),
// e traz de volta com --exportar. Duas maquinas, uma fonte versionada.
//
// Node puro, zero dependencia, Windows 11 / Node v24. A prova da copia e rodar de novo:
// todo arquivo IGUAL, comparado byte a byte.
// O destino e sempre os.homedir()/.claude (USERPROFILE no Windows, HOME no POSIX): o teste
// troca o home pela variavel de ambiente, nunca por opcao.
//
// Saidas: 0 = fez o que prometeu (instalou, exportou, ou emitiu o plano em --dry-run)
//         1 = parou e explicou por que, ou deixou pendencia.  Nunca um terceiro valor.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, constants } from 'node:fs';
import { join, dirname, relative, isAbsolute, sep, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const FONTE = join(RAIZ, 'usuario');
const HOME = homedir();
const DESTINO = join(HOME, '.claude');
const FRAGMENTO = 'settings.fragmento.json';
const ARQ_SETTINGS = join(DESTINO, 'settings.json');

// ---------------------------------------------------------------- ajuda ----
const AJUDA = `
instalar-usuario.mjs — sincroniza a camada de usuario do Claude Code entre usuario/ (no repo)
e ~/.claude/ (nesta maquina).

  node ${RAIZ}\\instalar-usuario.mjs [--dry-run] [--sobrescrever]
  node ${RAIZ}\\instalar-usuario.mjs --exportar <item> [<item>...] [--dry-run]

INSTALAR (padrao): usuario/ -> ~/.claude/
  Cada arquivo de usuario/ vai para ~/.claude/<mesmo caminho>:
    NOVO      nao existe la: copia.
    IGUAL     mesmos bytes: nada a fazer.
    DIFERE    existe e difere: fica como esta e sai no fim como pendente.
    ATUALIZA  so ~/.claude/${FRAGMENTO}, que e copia derivada: troca sempre, com backup.
  usuario/${FRAGMENTO} tambem e juntado ao ~/.claude/settings.json: {{HOME}} vira o
  home desta maquina; listas de permissions viram uniao; um hook e o mesmo quando tem o mesmo
  matcher e os comandos de um contem os do outro (barra invertida conta como barra normal):
  igual fica, diferente e trocado no lugar, o resto entra no fim; env, enabledPlugins,
  extraKnownMarketplaces e as demais chaves recebem o valor do fragmento nas chaves que ele
  declara. Hook ou statusLine que aponta para arquivo do home que nao existe nesta maquina
  (no Windows, nem com .exe, .cmd ou .bat) fica de fora (pula); rodar de novo depois de
  instalar o arquivo acrescenta. Antes de gravar: settings.json.bak-AAAA-MM-DD.

EXPORTAR: ~/.claude/ -> usuario/   (a maquina com a versao mais nova publica no repo)
  Itens relativos a ~/.claude/: CLAUDE.md, rules, hooks, agents, skills, commands,
  output-styles, mods (subcaminho vale, ex.: skills/intake) e settings.json, que vira
  usuario/${FRAGMENTO} so com permissions (deny, ask, additionalDirectories), hooks,
  enabledPlugins, extraKnownMarketplaces, statusLine e env CLAUDE_CODE_* que nao seja
  caminho. Em .md o caminho do home vira ~; no fragmento vira {{HOME}}. Grava com fim de
  linha LF (o repo forca LF em usuario/).

OPCOES
  --dry-run        Mostra o plano inteiro e nao escreve nada. COMECE POR AQUI.
  --sobrescrever   (instalar) Arquivo DIFERE: backup <arquivo>.bak-AAAA-MM-DD ao lado
                   (.2, .3... se ja existir) e copia a fonte por cima.
  --exportar       Inverte o sentido: os argumentos sao os itens a levar para usuario/.
  --help           Isto.

O QUE ELE NUNCA FAZ
  Sobrescrever arquivo diferente sem --sobrescrever. Apagar backup.
  Gravar por cima de um settings.json que nao conseguiu ler.
  Levar para usuario/: arquivo que casa padrao de segredo (chave, token, JWT, credencial em
  URL; placeholder de documentacao passa), arquivo com nome de segredo (.env*, *.pem, *.key,
  id_rsa*, credentials.json...), texto
  que nao e UTF-8, settings.local.json, .credentials.json, projects/, plugins/,
  permissions.allow, permissions.defaultMode, ou env que nao seja CLAUDE_CODE_*.

DEPOIS
  Instalar:  rode de novo com --dry-run   (todo arquivo IGUAL)
  Exportar:  git diff -- usuario/           (revise antes de commitar)

SAIDAS
  0  fez o que prometeu (ou, em --dry-run, o plano saiu inteiro)
  1  ficou arquivo DIFERE pendente sem --sobrescrever, item recusado, ou erro
`;

// ------------------------------------------------------------ argumentos ----
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(AJUDA);
  process.exit(0);
}

function parar(...linhas) {
  console.error('');
  for (const l of linhas) console.error(l);
  process.exit(1);
}

// Opcao com erro de digitacao nao pode virar instalacao de verdade: um --dry-rum ignorado
// escreveria em ~/.claude/.
const OPCOES = new Set(['--dry-run', '--sobrescrever', '--exportar']);
const desconhecidas = argv.filter((a) => a.startsWith('-') && !OPCOES.has(a));
if (desconhecidas.length) parar(`Opcao desconhecida: ${desconhecidas.join(' ')}`, 'Veja --help.');

const SECO = argv.includes('--dry-run');
const SOBRESCREVER = argv.includes('--sobrescrever');
const EXPORTAR = argv.includes('--exportar');
const itens = argv.filter((a) => !a.startsWith('-'));

if (EXPORTAR && SOBRESCREVER) parar('--sobrescrever vale so para instalar. Exportar grava em usuario/, e o git guarda a versao anterior.');
if (EXPORTAR && itens.length === 0) parar('Falta o item a exportar.', `Uso: node ${RAIZ}\\instalar-usuario.mjs --exportar skills/intake --dry-run`);
if (!EXPORTAR && itens.length) parar(`Argumento sem uso: ${itens.join(' ')}`, 'Itens so existem com --exportar. Veja --help.');

// ------------------------------------------------------------ utilidades ----
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const json = (v) => JSON.stringify(v);
const barra = (rel) => rel.split(sep).join('/');
const semBom = (t) => t.replace(/^\uFEFF/, '');

function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Backup nunca e apagado nem sobrescrito: o segundo do dia vira .2, o terceiro .3.
function nomeBackup(alvo) {
  const base = `${alvo}.bak-${hoje()}`;
  if (!existsSync(base)) return base;
  for (let n = 2; ; n++) if (!existsSync(`${base}.${n}`)) return `${base}.${n}`;
}

// Passeio a mao: sem `recursive` nem `Dirent.parentPath`.
function listar(dir, pular = () => false) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (pular(d, dir)) return [];
    const c = join(dir, d.name);
    return d.isDirectory() ? listar(c, pular) : d.isFile() ? [c] : [];
  });
}

// O home desta maquina nas tres grafias em que ele aparece em arquivo: barra normal,
// barra invertida e barra invertida escapada de JSON. Sem diferenciar maiuscula.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOME_NORMAL = HOME.replace(/\\/g, '/');
const HOME_INVERTIDA = HOME.replace(/\//g, '\\');
const HOME_JSON = HOME_INVERTIDA.replace(/\\/g, '\\\\');
// O lookahead impede trocar C:/Users/Ana dentro de C:/Users/Ana2.
const reHome = (forma) => new RegExp(`${esc(forma)}(?![\\w-])`, 'gi');
const temHome = (t) => [HOME_JSON, HOME_INVERTIDA, HOME_NORMAL].some((f) => reHome(f).test(t));
const trocarHome = (t, por, formas) => formas.reduce((acc, f) => acc.replace(reHome(f), por), t);

// ============================================================= INSTALAR ====
// O comando e dividido em tokens: "entre aspas duplas", 'entre aspas simples', ou sequencia
// sem espaco e sem ;&|<>(). Assim "C:/Users/x/Projeto X/h.mjs" e um caminho so, e nao
// "C:/Users/x/Projeto" inexistente. So conta token que comeca pelo home desta maquina, com
// qualquer barra, sem diferenciar maiuscula, e com fronteira logo depois do home.
const RE_TOKEN = /"[^"]*"|'[^']*'|[^\s;&|<>()]+/g;
const RE_COMECA_HOME = new RegExp(
  `^${/^[\\/]/.test(HOME) ? '[\\\\/]' : ''}${HOME.split(/[\\/]+/).filter(Boolean).map(esc).join('[\\\\/]+')}(?=$|[\\\\/])`,
  'i',
);
const caminhosDoHome = (cmd) => (cmd.match(RE_TOKEN) ?? [])
  .map((t) => t.replace(/^(["'])(.*)\1$/, '$2').replace(/,+$/, ''))
  .filter((t) => RE_COMECA_HOME.test(t));
// No Windows o comando acha `ferramenta` como ferramenta.exe (PATHEXT).
const EXTENSOES_EXECUTAVEL = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [];
const normCaminho = (c) => c.replace(/[\\/]+/g, '/').toLowerCase();

// Hook cujo comando aponta para arquivo do home que nao existe nesta maquina (o graphify numa
// maquina sem graphify) e erro a cada chamada de ferramenta. Fica de fora; quando o arquivo
// passar a existir, rodar de novo acrescenta.
function semCaminhoAusente(frag, existe, notas) {
  const existeExecutavel = (c) => existe(c) || EXTENSOES_EXECUTAVEL.some((x) => existe(`${c}${x}`));
  const ausente = (cmd) => (typeof cmd === 'string' ? caminhosDoHome(cmd) : []).find((c) => !existeExecutavel(c));
  const out = { ...frag };
  if (ehObjeto(frag.hooks)) {
    out.hooks = {};
    for (const [evento, entradas] of Object.entries(frag.hooks)) {
      out.hooks[evento] = (Array.isArray(entradas) ? entradas : []).filter((e) => {
        const falta = (Array.isArray(e?.hooks) ? e.hooks : []).map((h) => ausente(h?.command)).find(Boolean);
        if (falta) notas.push(`   pula   hooks.${evento}: ${falta} nao existe nesta maquina`);
        return !falta;
      });
    }
  }
  if (ehObjeto(frag.statusLine)) {
    const falta = ausente(frag.statusLine.command);
    if (falta) {
      notas.push(`   pula   statusLine: ${falta} nao existe nesta maquina`);
      delete out.statusLine;
    }
  }
  // Marketplace de pasta (mods) sem a pasta: sai ele e os plugins dele, senao o Claude
  // Code liga plugin de marketplace que nao existe.
  if (ehObjeto(frag.extraKnownMarketplaces)) {
    out.extraKnownMarketplaces = { ...frag.extraKnownMarketplaces };
    for (const [nome, m] of Object.entries(frag.extraKnownMarketplaces)) {
      const falta = m?.source?.source === 'directory' ? ausente(`"${m.source.path}"`) : undefined;
      if (!falta) continue;
      notas.push(`   pula   extraKnownMarketplaces.${nome} e seus plugins: ${falta} nao existe nesta maquina`);
      delete out.extraKnownMarketplaces[nome];
      if (ehObjeto(out.enabledPlugins)) {
        out.enabledPlugins = Object.fromEntries(Object.entries(out.enabledPlugins).filter(([p]) => !p.endsWith(`@${nome}`)));
      }
    }
  }
  return out;
}

// Um hook e o mesmo quando tem o mesmo matcher e o conjunto de comandos de um contem o do
// outro, em qualquer sentido, com barra invertida lida como barra normal: o hook escrito com
// C:\ volta do fragmento com C:/, e o fragmento que ganhou um comando ([a] -> [a, b]) troca a
// entrada no lugar. Intersecao parcial ([a, x] contra [a, b]) e outra entrada: rodar `a` duas
// vezes e melhor que perder o `x` local sem aviso. A troca de barra e so para comparar.
const comandoNorm = (c) => String(c ?? '').replace(/\\/g, '/');
const comandosDe = (e) => new Set((Array.isArray(e?.hooks) ? e.hooks : []).map((h) => comandoNorm(h?.command)));
const contem = (a, b) => [...b].every((c) => a.has(c));
function mesmaEntrada(x, e) {
  if ((x?.matcher ?? '') !== (e?.matcher ?? '')) return false;
  const cx = comandosDe(x);
  const ce = comandosDe(e);
  if (cx.size === 0 || ce.size === 0) return cx.size === ce.size;
  return contem(cx, ce) || contem(ce, cx);
}
const hookNorm = (e) => json(JSON.parse(json(e), (k, v) => (k === 'command' && typeof v === 'string' ? comandoNorm(v) : v)));

function juntarSettings(atual, frag) {
  const novo = structuredClone(atual);
  const mudancas = [];
  // Sub-objeto copiado e so devolvido ao `novo` se mudou: fragmento sem efeito nao cria
  // "hooks": {} nem "permissions": {} no settings.json.
  const copia = (chave) => (ehObjeto(novo[chave]) ? { ...novo[chave] } : {});
  for (const [chave, valor] of Object.entries(frag)) {
    const antes = mudancas.length;
    if (chave === 'permissions' && ehObjeto(valor)) {
      const perm = copia('permissions');
      for (const [k, v] of Object.entries(valor)) {
        if (Array.isArray(v)) {
          const base = Array.isArray(perm[k]) ? perm[k] : [];
          const vistos = new Set(base.map(json));
          const extra = [];
          for (const x of v) if (!vistos.has(json(x))) { vistos.add(json(x)); extra.push(x); }
          if (extra.length === 0 && Array.isArray(perm[k])) continue;
          perm[k] = [...base, ...extra];
          mudancas.push(`permissions.${k} +${extra.length}`);
        } else if (json(perm[k]) !== json(v)) {
          perm[k] = v;
          mudancas.push(`permissions.${k}`);
        }
      }
      if (mudancas.length > antes) novo.permissions = perm;
    } else if (chave === 'hooks' && ehObjeto(valor)) {
      const hooks = copia('hooks');
      for (const [evento, entradas] of Object.entries(valor)) {
        const lista = Array.isArray(hooks[evento]) ? [...hooks[evento]] : [];
        let mais = 0;
        let trocou = false;
        for (const e of Array.isArray(entradas) ? entradas : []) {
          const i = lista.findIndex((x) => mesmaEntrada(x, e));
          if (i < 0) { lista.push(e); mais++; continue; }
          if (hookNorm(lista[i]) === hookNorm(e)) continue;
          lista[i] = e;
          trocou = true;
          mudancas.push(`hooks.${evento} (${e?.matcher ?? 'sem matcher'})`);
        }
        if (mais) mudancas.push(`hooks.${evento} +${mais}`);
        if (mais || trocou) hooks[evento] = lista;
      }
      if (mudancas.length > antes) novo.hooks = hooks;
    } else if (['env', 'enabledPlugins', 'extraKnownMarketplaces'].includes(chave) && ehObjeto(valor)) {
      const mapa = copia(chave);
      for (const [k, v] of Object.entries(valor)) {
        if (json(mapa[k]) === json(v)) continue;
        mapa[k] = v;
        mudancas.push(`${chave}.${k}`);
      }
      if (mudancas.length > antes) novo[chave] = mapa;
    } else if (json(novo[chave]) !== json(valor)) {
      novo[chave] = valor;
      mudancas.push(chave);
    }
  }
  return { novo, mudancas };
}

function instalar() {
  console.log(`\nusuario  ${FONTE}\n     ->  ${DESTINO}${SECO ? '        [DRY-RUN: nada sera escrito]' : ''}`);
  if (!existsSync(FONTE)) parar(`Fonte ausente: ${FONTE}`);
  const arquivos = listar(FONTE).map((f) => relative(FONTE, f)).sort();
  if (arquivos.length === 0) parar(`Nenhum arquivo em ${FONTE}: nada a instalar.`);

  // ---- 1. arquivos: so leitura ate a fase 3 ----
  console.log('\n1. ARQUIVOS');
  const plano = [];
  for (const rel of arquivos) {
    const bytes = readFileSync(join(FONTE, rel));
    const alvo = join(DESTINO, rel);
    let estado = !existsSync(alvo) ? 'NOVO' : readFileSync(alvo).equals(bytes) ? 'IGUAL' : 'DIFERE';
    // ~/.claude/settings.fragmento.json e copia derivada de usuario/: ninguem edita la, entao
    // diferenca e so atraso. Troca sempre, com backup, e nao conta como pendente.
    if (estado === 'DIFERE' && rel === FRAGMENTO) estado = 'ATUALIZA';
    const p = { rel: barra(rel), alvo, bytes, estado };
    if (estado === 'ATUALIZA' || (estado === 'DIFERE' && SOBRESCREVER)) p.backup = nomeBackup(alvo);
    plano.push(p);
    let nota = '';
    if (estado === 'ATUALIZA') nota = `  -> copia derivada: backup ${barra(relative(DESTINO, p.backup))} e copia a fonte`;
    else if (estado === 'DIFERE') {
      nota = p.backup
        ? `  -> backup ${barra(relative(DESTINO, p.backup))} e copia a fonte`
        : '  -> pendente, nao tocado (--sobrescrever troca, com backup)';
    }
    console.log(`   ${estado.padEnd(8)} ${p.rel}${nota}`);
  }

  // ---- 2. settings.json: so leitura ----
  console.log(`\n2. settings.json  (fragmento usuario/${FRAGMENTO})`);
  let settings = null;
  if (!existsSync(join(FONTE, FRAGMENTO))) {
    console.log(`   sem usuario/${FRAGMENTO}: settings.json nao e tocado`);
  } else {
    let frag;
    try {
      const texto = semBom(readFileSync(join(FONTE, FRAGMENTO), 'utf8')).split('{{HOME}}').join(HOME_NORMAL);
      frag = JSON.parse(texto);
    } catch (e) {
      parar(`usuario/${FRAGMENTO} ilegivel: ${e.message}`, 'Nada foi escrito.');
    }
    if (!ehObjeto(frag)) parar(`usuario/${FRAGMENTO} nao e um objeto JSON. Nada foi escrito.`);

    const existia = existsSync(ARQ_SETTINGS);
    let atual = {};
    if (existia) {
      try {
        atual = JSON.parse(semBom(readFileSync(ARQ_SETTINGS, 'utf8')));
      } catch (e) {
        parar(`${ARQ_SETTINGS} ilegivel: ${e.message}`, 'Nada foi escrito. Conserte o arquivo a mao e rode de novo.');
      }
      if (!ehObjeto(atual)) parar(`${ARQ_SETTINGS} nao e um objeto JSON. Nada foi escrito.`);
    }

    // "Existe depois da copia": ja existe no disco, ou e NOVO no plano (vale no --dry-run).
    const planejados = new Set(plano.filter((p) => p.estado === 'NOVO').map((p) => normCaminho(p.alvo)));
    // Pasta conta como planejada quando algum arquivo NOVO fica dentro dela (a de mods).
    const existe = (c) => existsSync(c) || planejados.has(normCaminho(c))
      || [...planejados].some((p) => p.startsWith(`${normCaminho(c).replace(/\/$/, '')}/`));
    const notas = [];
    const { novo, mudancas } = juntarSettings(atual, semCaminhoAusente(frag, existe, notas));
    for (const n of notas) console.log(n);
    if (json(novo) === json(atual)) {
      console.log('   settings.json: ja contem o fragmento');
    } else {
      settings = { novo, backup: existia ? nomeBackup(ARQ_SETTINGS) : null };
      for (const m of mudancas) console.log(`   muda   ${m}`);
      console.log(settings.backup
        ? `   backup ${barra(relative(DESTINO, settings.backup))}`
        : '   novo   settings.json (nao existia)');
    }
  }

  // ---- 3. escrita ----
  const pendentes = plano.filter((p) => p.estado === 'DIFERE' && !SOBRESCREVER);
  if (!SECO) {
    for (const p of plano) {
      if (p.estado === 'IGUAL' || (p.estado === 'DIFERE' && !SOBRESCREVER)) continue;
      mkdirSync(dirname(p.alvo), { recursive: true });
      if (p.backup) copyFileSync(p.alvo, p.backup, constants.COPYFILE_EXCL);
      writeFileSync(p.alvo, p.bytes);
    }
    if (settings) {
      mkdirSync(DESTINO, { recursive: true });
      if (settings.backup) copyFileSync(ARQ_SETTINGS, settings.backup, constants.COPYFILE_EXCL);
      writeFileSync(ARQ_SETTINGS, `${JSON.stringify(settings.novo, null, 2)}\n`);
    }
  }

  // ---- 4. resumo ----
  const conta = (e) => plano.filter((p) => p.estado === e).length;
  const estadoSettings = settings ? 'muda' : 'sem mudanca';
  console.log(`\nRESUMO  ${SECO ? 'PLANO (nada escrito)' : 'INSTALADO'}  ·  ${conta('NOVO')} novo(s)  ·  ${conta('IGUAL')} igual(is)  ·  ${conta('DIFERE')} difere(m)  ·  ${conta('ATUALIZA')} atualiza  ·  settings.json ${estadoSettings}`);
  if (pendentes.length) {
    console.log(`\nPENDENTE — ${SECO ? 'ficaria sem tocar' : 'nada foi sobrescrito'}:`);
    for (const p of pendentes) console.log(`   ${p.rel}`);
    console.log('   Confira qual lado e o certo:');
    console.log('   - usuario/ esta certo (inclusive quando esta maquina acabou de exportar e o .md ganhou ~):');
    console.log('     rode com --sobrescrever, que faz backup.');
    console.log('   - ~/.claude/ esta certo: exporte (--exportar <item>) e revise o diff.');
  }
  console.log('\nProva: rode de novo com --dry-run (todo arquivo IGUAL)');
  console.log('');
  process.exit(!SECO && pendentes.length ? 1 : 0);
}

// ============================================================= EXPORTAR ====
// mods e o marketplace local de plugins: a pasta vai como esta, e o settings.json o registra
// em extraKnownMarketplaces com {{HOME}}/.claude/mods.
const PERMITIDOS = ['CLAUDE.md', 'rules', 'hooks', 'agents', 'skills', 'commands', 'output-styles', 'mods', 'settings.json'];
const SO_ARQUIVO = new Set(['CLAUDE.md', 'settings.json']);
const PASTAS_PULADAS = new Set(['node_modules', '.git']);
const pulaNome = (nome) => /\.bak$/i.test(nome) || /\.bak-/i.test(nome) || /\.harness-novo$/i.test(nome);
const TEXTO = new Set(['.md', '.mjs', '.js', '.ts', '.tsx', '.json', '.txt', '.sh', '.ps1', '.py', '.yaml', '.yml', '.toml']);
const CHAVES_FRAGMENTO = ['permissions', 'hooks', 'enabledPlugins', 'extraKnownMarketplaces', 'statusLine', 'env'];
// allow e defaultMode sao o estado de trabalho desta maquina, nao regra a levar para a outra.
const PERMISSOES_FRAGMENTO = ['deny', 'ask', 'additionalDirectories'];
const NOME_USUARIO = basename(HOME);
const RE_USUARIO = new RegExp(`Users[\\\\/]+${esc(NOME_USUARIO)}(?![\\w-])`, 'i');
const pareceCaminho = (v) => /^([a-zA-Z]:[\\/]|\/)/.test(String(v)) || temHome(String(v));

// A mensagem cita o NOME do padrao, nunca o trecho que casou.
// Os padroes exigem o corpo do segredo, nao so o prefixo: agente e skill de seguranca, devops
// e banco vivem de exemplo (`sk_live_...`, `-----BEGIN PUBLIC KEY-----`, a chave EXAMPLE da
// AWS), e prefixo sozinho recusava o export inteiro por documentacao.
const SEGREDOS = [
  ['sk-ant-', /sk-ant-/],
  ['ghp_', /ghp_/],
  ['gho_', /gho_/],
  ['github_pat_', /github_pat_/],
  ['xox[bp]-', /xox[bp]-/],
  ['AKIA', /AKIA(?![0-9A-Z]*EXAMPLE)[0-9A-Z]{16}/],
  ['BEGIN PRIVATE KEY', /-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{20,}/],
  ['JWT', /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/],
  ['sbp_', /sbp_[0-9a-f]{20,}/],
  ['sk_live_ / sk_test_', /sk_(live|test)_[0-9A-Za-z]{16,}/],
  ['sk-proj-', /sk-proj-[\w-]{20,}/],
  ['AIza', /AIza[\w-]{35}/],
  ['Bearer', /Bearer\s+(?=[\w.-]*\d)[\w.-]{20,}/],
];

// Credencial em URL: a regex so captura (usuario, senha, host); quem decide e ehPlaceholder.
// Placeholder de documentacao nao e segredo: senha entre [] <> ${}, senha de exemplo
// (postgres, password...) ou comecando com "your", e host local.
const RE_URL_CREDENCIAL = /:\/\/([^/\s:@]+):([^@\s/]+)@([^/\s:?#]+)/g;
const SENHAS_EXEMPLO = new Set(['postgres', 'password', 'senha', 'pass', 'secret', 'changeme', 'example']);
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
function ehPlaceholder(usuario, senha, host) {
  if (/^(\[.*\]|<.*>|\$\{.*\})$/.test(senha)) return true;
  const s = senha.toLowerCase();
  if (SENHAS_EXEMPLO.has(s) || s.startsWith('your')) return true;
  return HOSTS_LOCAIS.has(host.toLowerCase());
}
const credencialEmUrl = (t) => [...t.matchAll(RE_URL_CREDENCIAL)].some(([, usuario, senha, host]) => !ehPlaceholder(usuario, senha, host));

const segredoEm = (t) => SEGREDOS.find(([, re]) => re.test(t))?.[0] ?? (credencialEmUrl(t) ? 'credencial em URL' : undefined);

// Nome de arquivo de segredo, na mesma ideia de .claude/hooks/protege-segredo.mjs (sem
// importar dele): minusculas, porque o Windows nao diferencia .ENV de .env; `.env` seguido de
// delimitador pega .env.local, .envrc e .env-backup sem pegar .environment-notes.md. Aqui
// .env.example tambem e recusado: no repo ele nao e editado, e exportar nao precisa dele.
const NOMES_SEGREDO = [
  ['.env*', /^\.env(rc)?($|[.\-_])/],
  ['*.pem', /\.pem$/],
  ['*.key', /\.key$/],
  ['*.p12 / *.pfx', /\.(p12|pfx)$/],
  ['id_rsa* / id_ecdsa* / id_ed25519*', /^id_(rsa|ecdsa|ed25519)/],
  // So o arquivo de credencial em si; credentials-rotation.md e documentacao e passa.
  ['credentials / .credentials', /^\.?credentials(\.(json|ya?ml|ini|toml|csv))?$/],
];
const nomeDeSegredo = (arq) => NOMES_SEGREDO.find(([, re]) => re.test(basename(arq).toLowerCase()))?.[0];

function validarItem(item) {
  if (isAbsolute(item) || /^[a-zA-Z]:/.test(item) || /^[\\/]/.test(item)) return { erro: `${item}: caminho absoluto nao vale; use caminho relativo a ~/.claude` };
  const segs = item.split(/[\\/]+/).filter(Boolean);
  if (segs.length === 0 || segs.some((s) => s === '.' || s === '..')) return { erro: `${item}: . e .. nao valem` };
  if (!PERMITIDOS.includes(segs[0])) return { erro: `${item}: fora do permitido (${PERMITIDOS.join(', ')})` };
  if (SO_ARQUIVO.has(segs[0]) && segs.length > 1) return { erro: `${item}: ${segs[0]} e arquivo, nao pasta` };
  const origem = join(DESTINO, ...segs);
  if (!existsSync(origem)) return { erro: `${item}: nao existe em ${DESTINO}` };
  return { rel: segs.join('/'), origem };
}

function fragmentoDe(origem, saida) {
  let s;
  try {
    s = JSON.parse(semBom(readFileSync(origem, 'utf8')));
  } catch (e) {
    parar(`${origem} ilegivel: ${e.message}`, 'Nada foi escrito.');
  }
  if (!ehObjeto(s)) parar(`${origem} nao e um objeto JSON. Nada foi escrito.`);
  const frag = {};
  for (const [k, v] of Object.entries(s)) if (CHAVES_FRAGMENTO.includes(k)) frag[k] = v;
  const fora = Object.keys(s).filter((k) => !CHAVES_FRAGMENTO.includes(k));
  if (fora.length) saida.push(`   fora   chave(s) de topo que nao entram: ${fora.join(', ')}`);
  if ('permissions' in frag) {
    const perm = ehObjeto(frag.permissions) ? frag.permissions : {};
    const permFora = Object.keys(perm).filter((k) => !PERMISSOES_FRAGMENTO.includes(k));
    if (permFora.length) saida.push(`   fora   permissions que sao estado desta maquina: ${permFora.join(', ')}`);
    frag.permissions = Object.fromEntries(Object.entries(perm).filter(([k]) => PERMISSOES_FRAGMENTO.includes(k)));
    if (Object.keys(frag.permissions).length === 0) delete frag.permissions;
  }
  if ('env' in frag) {
    const env = ehObjeto(frag.env) ? frag.env : {};
    const envFora = Object.keys(env).filter((k) => !k.startsWith('CLAUDE_CODE_'));
    if (envFora.length) saida.push(`   fora   env que nao e CLAUDE_CODE_* (so o nome): ${envFora.join(', ')}`);
    const envCaminho = Object.keys(env).filter((k) => k.startsWith('CLAUDE_CODE_') && pareceCaminho(env[k]));
    if (envCaminho.length) saida.push(`   fora   env com valor de caminho desta maquina (so o nome): ${envCaminho.join(', ')}`);
    frag.env = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('CLAUDE_CODE_') && !envCaminho.includes(k)));
    if (Object.keys(frag.env).length === 0) delete frag.env;
  }
  // A escapada primeiro: no texto JSON a barra invertida sempre aparece dobrada.
  const texto = trocarHome(`${JSON.stringify(frag, null, 2)}\n`, '{{HOME}}', [HOME_JSON, HOME_INVERTIDA, HOME_NORMAL]);
  // O home escrito de outro jeito (//c/Users/<nome>, /c/Users/<nome>) escapa das tres trocas.
  if (RE_USUARIO.test(texto)) saida.push(`   AVISO  ${FRAGMENTO} contem caminho desta maquina numa forma nao trocada: revise`);
  return Buffer.from(texto, 'utf8');
}

function exportar() {
  console.log(`\n~/.claude  ${DESTINO}\n      ->  ${FONTE}${SECO ? '        [DRY-RUN: nada sera escrito]' : ''}`);

  // ---- 1. todos os itens validados antes de qualquer escrita ----
  const validos = [];
  const erros = [];
  for (const item of itens) {
    const v = validarItem(item);
    if (v.erro) erros.push(`   [x] ${v.erro}`);
    else validos.push(v);
  }
  if (erros.length) parar('Item recusado. Nada foi escrito:', ...erros);

  // ---- 2. o que seria gravado: so leitura ----
  console.log('\n1. ITENS');
  const saidas = new Map();
  const recusados = [];
  const notas = [];
  let portavel = false;
  for (const v of validos) {
    if (v.rel === 'settings.json') {
      const buf = fragmentoDe(v.origem, notas);
      const padrao = segredoEm(buf.toString('utf8'));
      if (padrao) recusados.push(`settings.json: casa o padrao de segredo ${padrao}`);
      else saidas.set(FRAGMENTO, buf);
      continue;
    }
    const pular = (d, dir) => {
      if (d.isDirectory() ? PASTAS_PULADAS.has(d.name) : pulaNome(d.name)) {
        notas.push(`   pula   ${barra(relative(DESTINO, join(dir, d.name)))}`);
        return true;
      }
      return false;
    };
    const arquivos = statSync(v.origem).isDirectory() ? listar(v.origem, pular) : [v.origem];
    for (const arq of arquivos) {
      const rel = barra(relative(DESTINO, arq));
      const nome = nomeDeSegredo(arq);
      if (nome) { recusados.push(`${rel}: nome de arquivo de segredo (${nome})`); continue; }
      const original = readFileSync(arq);
      const texto = original.toString('utf8');
      const padrao = segredoEm(texto);
      if (padrao) { recusados.push(`${rel}: casa o padrao de segredo ${padrao}`); continue; }
      const ext = extname(arq).toLowerCase();
      // Texto e decodificado e recodificado: um Latin-1 sairia com U+FFFD no lugar do acento.
      if (TEXTO.has(ext) && texto.includes('\uFFFD')) { recusados.push(`${rel}: nao e UTF-8`); continue; }
      let buf = original;
      if (ext === '.md') {
        buf = Buffer.from(trocarHome(texto.replace(/\r\n/g, '\n'), '~', [HOME_INVERTIDA, HOME_NORMAL]), 'utf8');
      } else {
        if (TEXTO.has(ext)) buf = Buffer.from(texto.replace(/\r\n/g, '\n'), 'utf8');
        if (temHome(texto)) notas.push(`   AVISO  ${rel} contem caminho desta maquina: revise`);
      }
      // A copia de usuario/ deixa de ser igual a deste ~/.claude/: depois do merge, esta
      // maquina precisa adotar a versao portavel, senao a proxima instalacao acusa DIFERE.
      if (!buf.equals(original)) portavel = true;
      saidas.set(rel, buf);
    }
  }
  for (const n of notas) console.log(n);

  const gravar = [];
  for (const [rel, buf] of [...saidas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const alvo = join(FONTE, ...rel.split('/'));
    const estado = !existsSync(alvo) ? 'NOVO' : readFileSync(alvo).equals(buf) ? 'IGUAL' : 'DIFERE';
    console.log(`   ${estado.padEnd(7)} usuario/${rel}`);
    if (estado !== 'IGUAL') gravar.push({ rel, alvo, buf });
  }
  for (const r of recusados) console.log(`   RECUSADO ${r} (nao copiado)`);

  // ---- 3. escrita ----
  if (!SECO) {
    for (const g of gravar) {
      mkdirSync(dirname(g.alvo), { recursive: true });
      writeFileSync(g.alvo, g.buf);
    }
  }

  // ---- 4. resumo ----
  console.log(`\n${SECO ? 'GRAVARIA (nada escrito)' : 'GRAVADOS'}: ${gravar.length ? '' : 'nenhum (usuario/ ja igual)'}`);
  for (const g of gravar) console.log(`   usuario/${g.rel}`);
  if (recusados.length) console.log(`\nRECUSADOS: ${recusados.length} arquivo(s), nenhum copiado. Tire o segredo, renomeie ou converta para UTF-8 e exporte de novo.`);
  console.log('\nRevise o diff (git diff -- usuario/) antes de commitar.');
  if (portavel) console.log(`Depois do merge, rode nesta maquina: node ${RAIZ}\\instalar-usuario.mjs --dry-run e depois --sobrescrever, para adotar a versao portavel (faz backup).`);
  console.log('');
  process.exit(recusados.length ? 1 : 0);
}

if (EXPORTAR) exportar();
else instalar();
