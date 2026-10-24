#!/usr/bin/env node
// scripts/tree-check.mjs   ->   portao `tree:check` (dicionario 2.7)
//
// Arvore de trabalho limpa: nada em stage, nada modificado, nada nao rastreado.
//
// Existe por um motivo de plataforma. O teste natural seria
// `git diff --quiet && git diff --cached --quiet`, e `&&` e erro de parse no PowerShell 5.1,
// que e o console padrao do leitor (dicionario 2.7 e 5). Portao que so roda em bash nao e
// portao. O par de comandos virou este arquivo, com nome no dicionario.
//
// Ele e mais estrito que o par acima num ponto: arquivo NAO RASTREADO tambem suja. O
// orquestrador commita por lista explicita de caminhos (Parte 13.6), entao arquivo que
// ninguem adicionou nao entra em commit nenhum e some no proximo checkout limpo.
//
// Saidas: 0 = limpa  ·  1 = suja, ou nao deu para medir. Nunca um terceiro valor.
// Uso:    node scripts/tree-check.mjs [raiz]   (padrao: a pasta acima de scripts/)
// Zero dependencia externa: so o proprio `git`.
//
// SABOTAGEM (confirmado, nenhum verde vazio encontrado, sem mudanca de comportamento):
//   1. pasta inexistente -> "TREE:CHECK NAO MEDIU ... nao e arvore de trabalho do git",
//      saida 1.
//   2. pasta que existe mas esta fora de qualquer repositorio git -> mesma mensagem,
//      "fatal: not a git repository", saida 1.
//   `git status --porcelain` sempre devolve algo verificavel: limpo e string vazia (saida
//   0), qualquer linha e sujeira (saida 1). Nao ha alvo "vazio" que passe sem medir.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUJA = 1;
const TETO_LISTA = 20;

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(process.argv[2] ?? process.env.TREE_RAIZ ?? join(AQUI, '..'));

function reprovar(...linhas) {
  for (const l of linhas) if (l !== '') console.error(l);
  process.exit(SUJA);
}

function git(...args) {
  try {
    return spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8', windowsHide: true });
  } catch (e) {
    return { error: e, status: null, stdout: '', stderr: String(e?.message ?? e) };
  }
}

// ---- 1. da para medir? -----------------------------------------------------
// Sem git no PATH ou fora de repositorio, o portao NAO passa: portao que passa sem medir
// nada e pior que portao nenhum, e um 0 aqui seria indistinguivel de arvore limpa.
const dentro = git('rev-parse', '--is-inside-work-tree');
if (dentro.error || dentro.status !== 0 || dentro.stdout.trim() !== 'true') {
  reprovar(
    `TREE:CHECK NAO MEDIU: ${RAIZ} nao e arvore de trabalho do git.`,
    (dentro.stderr ?? '').trim() || '  git ausente do PATH, ou pasta fora de repositorio.',
    'Rode dentro do repositorio, ou passe a raiz: node scripts/tree-check.mjs <raiz>',
  );
}

// ---- 2. o estado -----------------------------------------------------------
// --porcelain=v1 e o formato estavel entre versoes do git; -uall lista arquivo por arquivo
// em vez de so a pasta, porque "src/novo/" nao diz o que ficou de fora.
const st = git('status', '--porcelain=v1', '-uall');
if (st.error || st.status !== 0) {
  reprovar('TREE:CHECK NAO MEDIU: `git status` falhou.', (st.stderr ?? '').trim());
}

const linhas = st.stdout.split(/\r?\n/).filter((l) => l.trim() !== '');
const ramo = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim() || '(sem HEAD)';

if (linhas.length === 0) {
  console.log(`arvore limpa em ${ramo}: nada em stage, nada modificado, nada nao rastreado`);
  process.exit(0);
}

// ---- 3. o que esta pendente ------------------------------------------------
// Codigo XY do porcelain: X = indice, Y = arvore de trabalho. '??' e nao rastreado, e os
// pares com U sao conflito de merge, que nao e "sujo", e trabalho pela metade.
const CONFLITOS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
const emStage = [];
const naoCommitado = [];
const naoRastreado = [];
const conflito = [];

for (const linha of linhas) {
  const xy = linha.slice(0, 2);
  const caminho = linha.slice(3);
  if (xy === '??') { naoRastreado.push(caminho); continue; }
  if (CONFLITOS.has(xy)) { conflito.push(`${caminho}  (${xy})`); continue; }
  if (xy[0] !== ' ') emStage.push(`${caminho}  (${xy[0]})`);
  if (xy[1] !== ' ') naoCommitado.push(`${caminho}  (${xy[1]})`);
}

const bloco = (titulo, itens) => (itens.length === 0 ? [] : [
  `${titulo} (${itens.length}):`,
  ...itens.slice(0, TETO_LISTA).map((i) => `  ${i}`),
  ...(itens.length > TETO_LISTA ? [`  ... e mais ${itens.length - TETO_LISTA}`] : []),
]);

reprovar(
  `ARVORE SUJA em ${ramo}: ${linhas.length} caminho(s) pendente(s).`,
  ...bloco('conflito de merge', conflito),
  ...bloco('em stage, nao commitado', emStage),
  ...bloco('modificado, fora do stage', naoCommitado),
  ...bloco('nao rastreado', naoRastreado),
  '',
  'Commite, guarde em stash ou descarte antes de seguir. `git status` mostra o mesmo com contexto.',
);
