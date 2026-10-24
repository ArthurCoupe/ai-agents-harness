#!/usr/bin/env node
// scripts/profile-check.mjs   ->   portao `profile:check` (dicionario 2.6)
//
// O portao NAO classifica. Classificar e o procedimento de tres perguntas do dicionario 4,
// que voce responde uma vez e grava em `.perfil`. Este script so detecta SINAL DE PERFIL
// SUPERIOR ao declarado e reprova.
//
// Mao unica por construcao: repositorio declarado CRM nunca falha por falta de sinal.
// Declarar perfil alto demais custa portoes extras, nao build vermelho.
//
// Saidas:  0 = coerente (ou perfil no topo)   ·   2 = reprovado
// Uso:     node scripts/profile-check.mjs [raiz]   (padrao: a pasta acima de scripts/)
//
// SABOTAGEM (guarda anti-vacuidade: guarda que nao executou nada e guarda vazia):
//   1. `.perfil` valido, nenhuma das RAIZES existe na raiz (mkdir so a raiz, sem apps/
//      packages/src/server/supabase/prisma/db) -> antes: saida 0, "perfil X: coerente com
//      o repositorio (0 arquivos lidos)". depois: saida 2, "PROFILE:CHECK NAO MEDIU: 0
//      arquivos lidos".
//   2. `.perfil` valido, as RAIZES existem mas estao todas vazias (ex.: so `mkdir raiz/src`
//      sem arquivo dentro) -> mesmo antes/depois do caso 1.
//   3. raiz sem `.perfil` -> ja reprovava (PERFIL AUSENTE, saida 2) antes desta mudanca;
//      confirmado sem alteracao de comportamento.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPROVADO = 2;
const ORDEM = ['SITE', 'APP', 'SAAS', 'CRM'];

// O sinal E a definicao do perfil (dicionario 4), traduzida para regex.
//   APP  = existe sessao de usuario.
//   SAAS = existe fronteira entre organizacoes.
//   CRM  = o dado principal e de pessoa que nao e usuaria (P2).
//
// Sinal estreito de proposito. `createMany`, `bulkCreate` e `cpf` disparam em SAAS legitimo:
// um portao que grita no caso legitimo ensina o leitor a contornar o portao, e a partir dai
// ele nao protege mais nada.
const SINAIS = {
  APP: [
    /supabase\.auth\./,
    /signInWith\w*\(/,
    /next-auth/,
    /jsonwebtoken/,
    /\b(bcrypt|argon2)\b/,
    /auth\.uid\(\)/,
  ],
  SAAS: [
    /\b(tenant_id|tenantId)\b/,
    /\b(organization_id|organizationId)\b/,
    /\b(workspace_id|workspaceId)\b/,
  ],
  CRM: [
    // 1. o dado em si: tabela de PESSOA que nao usa o sistema. E a definicao do perfil
    //    (dicionario 4, P2), nao uma consequencia dela. So casa em criacao de tabela — um
    //    `const contacts = ...` em codigo nao e sinal de nada.
    /create\s+table\s+(if\s+not\s+exists\s+)?[a-z_."]*\b(leads?|lead_touches|prospects?|contatos?|contacts?|oportunidades?|opportunities)\b/i,
    // 2. a tabela que so existe quando a importacao em lote virou processo
    /\bimport_jobs?\b/,
  ],
};

// Sinal que so conta JUNTO de um sinal principal do mesmo perfil. Biblioteca de planilha ou
// CSV diz COMO o dado chega, nao DE QUEM ele e (P2): APP le planilha o tempo todo — ETL de
// ERP, extrato financeiro, relatorio exportado. Sozinha ela nao reprova, so avisa.
// CALIBRAGEM (26/09): um APP com ETL de planilhas financeiras e de producao (47 arquivos com
// xlsx/exceljs, nenhuma tabela de pessoa) -> antes: saida 2, "o codigo ja e CRM", e a unica
// saida era duas excecoes, que o proprio script le como perfil errado. depois: saida 0 com
// AVISO. Com `create table leads` no mesmo repositorio -> saida 2, com as planilhas listadas.
const SO_JUNTO = {
  CRM: [/\b(papaparse|csv-parse|csv-parser|xlsx|exceljs)\b/],
};

// CRM nao exige multi-tenancy (dicionario 4, "as duas variantes"). Um CRM de uma empresa so
// tem P2=SIM e P3=NAO: guarda dado de quem nunca aceitou nada, sem fronteira entre clientes.
// Por isso CRM esta acima de SAAS na ORDEM: quem declarou SAAS e tem tabela de lead nao esta
// protegendo o titular. O contrario — CRM sem tenant — e legitimo e nao dispara nada.

const RAIZES = ['apps', 'packages', 'src', 'server', 'supabase', 'prisma', 'db'];
const IGNORAR = new Set(['node_modules', 'dist', '.next', 'build', 'coverage', '.git', 'seed']);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.prisma']);

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(process.argv[2] ?? process.env.PERFIL_RAIZ ?? join(AQUI, '..'));

function reprovar(...linhas) {
  for (const l of linhas) console.error(l);
  process.exit(REPROVADO);
}

function arquivos(dir, acc = []) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entradas) {
    if (IGNORAR.has(e.name)) continue;
    const caminho = join(dir, e.name);
    if (e.isDirectory()) arquivos(caminho, acc);
    else if (EXT.has(extname(e.name))) acc.push(caminho);
  }
  return acc;
}

// ---- 1. o perfil declarado -------------------------------------------------
// `.perfil` na raiz, uma linha (dicionario 4 e 6). Ausencia e setup quebrado, nao "SITE".
const ARQ_PERFIL = join(RAIZ, '.perfil');
if (!existsSync(ARQ_PERFIL)) {
  reprovar(
    `PERFIL AUSENTE: ${ARQ_PERFIL} nao existe.`,
    'Responda as tres perguntas do dicionario secao 4 e grave o resultado numa linha:',
    '  SITE | APP | SAAS | CRM',
  );
}

const declaradoTexto = readFileSync(ARQ_PERFIL, 'utf8').trim().toUpperCase();
const declarado = ORDEM.indexOf(declaradoTexto);
if (declarado < 0) {
  reprovar(`PERFIL INVALIDO: "${declaradoTexto}" em ${ARQ_PERFIL}. Use SITE, APP, SAAS ou CRM.`);
}

// ---- 2. as excecoes --------------------------------------------------------
// `.perfil-excecoes`, versionado, uma por linha, no formato PERFIL:sinal.
// Versionado porque excecao precisa aparecer no diff para ser revisavel.
const ARQ_EXCECOES = join(RAIZ, '.perfil-excecoes');
const excecoes = new Set();
if (existsSync(ARQ_EXCECOES)) {
  for (const linha of readFileSync(ARQ_EXCECOES, 'utf8').split(/\r?\n/)) {
    const limpa = linha.split('#')[0].trim().toLowerCase();
    if (limpa !== '') excecoes.add(limpa);
  }
}

// ---- 3. a varredura --------------------------------------------------------
const achados = [];
const alvos = RAIZES.map((r) => join(RAIZ, r)).flatMap((r) => arquivos(r));

// Guarda anti-vacuidade: 0 arquivos lidos nao e "coerente", e o portao nao verificou nada.
// Toda RAIZ ausente ou vazia da o mesmo resultado de um repositorio limpo, e a diferenca so
// aparece se alguem contar quantos arquivos entraram na varredura.
if (alvos.length === 0) {
  reprovar(
    `PROFILE:CHECK NAO MEDIU: 0 arquivos lidos em ${RAIZ}.`,
    `Nenhuma das RAIZES existe ou todas estao vazias: ${RAIZES.join(', ')}`,
    'Confira a raiz: node scripts/profile-check.mjs [raiz]  (padrao: a pasta acima de scripts/)',
  );
}

function casar(texto, arquivo, sinais, destino) {
  for (const [perfil, padroes] of Object.entries(sinais)) {
    if (ORDEM.indexOf(perfil) <= declarado) continue; // sinal do proprio nivel ou abaixo: esperado
    for (const padrao of padroes) {
      const m = texto.match(padrao);
      if (!m) continue;
      const chave = `${perfil}:${m[0]}`.toLowerCase();
      if (excecoes.has(chave)) continue;
      const relativo = arquivo.slice(RAIZ.length + 1).replace(/\\/g, '/');
      destino.push({ perfil, arquivo: relativo, sinal: m[0], chave });
    }
  }
}

const soJunto = [];
for (const arquivo of alvos) {
  let texto;
  try {
    texto = readFileSync(arquivo, 'utf8');
  } catch {
    continue;
  }
  casar(texto, arquivo, SINAIS, achados);
  casar(texto, arquivo, SO_JUNTO, soJunto);
}

// SO_JUNTO vira evidencia quando o perfil ja tem sinal principal; sozinho, so avisa.
const comPrincipal = new Set(achados.map((a) => a.perfil));
const soAviso = soJunto.filter((a) => !comPrincipal.has(a.perfil));
achados.push(...soJunto.filter((a) => comPrincipal.has(a.perfil)));
if (soAviso.length > 0) {
  const perfis = [...new Set(soAviso.map((a) => a.perfil))].join('/');
  console.error(
    `AVISO: ${soAviso.length} arquivo(s) leem planilha ou CSV (ex.: ${soAviso[0].arquivo} -> "${soAviso[0].sinal}"). ` +
      `Sozinho nao e sinal de ${perfis}: suba o perfil se o dado que entra por arquivo for de pessoa que nao usa o sistema (dicionario 4, P2).`,
  );
}

// Duas excecoes no mesmo perfil significam classificacao errada, nao caso especial.
const porPerfil = {};
for (const c of excecoes) {
  const p = c.split(':')[0].toUpperCase();
  porPerfil[p] = (porPerfil[p] ?? 0) + 1;
}
for (const [p, n] of Object.entries(porPerfil)) {
  if (n >= 2) console.error(`AVISO: ${n} excecoes de ${p} em .perfil-excecoes. Duas ou mais = o perfil esta errado.`);
}

if (achados.length === 0) {
  console.log(`perfil ${declaradoTexto}: coerente com o repositorio (${alvos.length} arquivos lidos)`);
  process.exit(0);
}

const alvo = achados.reduce((a, b) => (ORDEM.indexOf(a.perfil) > ORDEM.indexOf(b.perfil) ? a : b)).perfil;
reprovar(
  `PERFIL DESATUALIZADO: declarado ${declaradoTexto}, o codigo ja e ${alvo}`,
  ...achados.slice(0, 20).map((a) => `  ${a.arquivo}  ->  "${a.sinal}"  (sinal de ${a.perfil}, chave ${a.chave})`),
  '',
  `Suba .perfil para ${alvo}, rode o intake das fases que passam a valer e ligue os portoes`,
  `desse perfil (dicionario secao 2). Excecao legitima vai em .perfil-excecoes, versionada.`,
);
