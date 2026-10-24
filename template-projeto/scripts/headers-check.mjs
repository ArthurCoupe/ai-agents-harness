#!/usr/bin/env node
// scripts/headers-check.mjs   ->   portao `headers:check` (dicionario 2.5)
//
// Roda contra URL PUBLICADA, nunca contra o build. Cabecalho so existe depois do deploy;
// por isso este portao mora no tier 4 (`verify:deploy`) e NUNCA entra em `verify`.
//
// Uso:  node scripts/headers-check.mjs https://preview.exemplo.com.br
//       ou DEPLOY_URL=https://... node scripts/headers-check.mjs
//
// Saidas: 0 = todos os cabecalhos exigidos presentes e coerentes
//         1 = faltou cabecalho, valor inesperado, rede caiu, ou URL nao informada
// Nunca 0 silencioso: sem URL o portao reprova, porque um portao que passa sem medir nada
// e pior do que portao nenhum.
//
// ARMADILHA MEDIDA NESTA MAQUINA: `process.exit()` depois de um `fetch` derruba o Node no
// Windows com "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" e saida 127 — nem 0
// nem 1, e o CI le 127 como "portao passou de forma estranha". Por isso este script cancela
// o corpo da resposta e usa `process.exitCode`, deixando o Node fechar os sockets sozinho.
//
// SABOTAGEM (guarda anti-vacuidade: guarda que nao executou nada e guarda vazia):
//   1. servidor HTTP local offline (node) respondendo 404 com CSP com frame-ancestors,
//      HSTS max-age=31536000, nosniff e referrer-policy, todos corretos -> antes: saida 0,
//      "cabecalhos OK". depois: saida 1, "status final 404: isso mede a pagina de erro,
//      nao a aplicacao".
//   2. o mesmo servidor respondendo 200 com os mesmos cabecalhos -> continua saida 0
//      (caminho feliz, sem mudanca).
//   3. sem URL, e URL de host inalcancavel -> ja reprovavam (saida 1) antes desta mudanca;
//      confirmado sem alteracao de comportamento.

const FALHA = 1;

// Escolha do autor, nao padrao externo: 180 dias de HSTS. Ajuste por HSTS_MIN_AGE.
const HSTS_MIN = Number(process.env.HSTS_MIN_AGE ?? 15552000);

/** Verificacoes por cabecalho. Ausencia sempre reprova; `forma` reprova valor presente e errado. */
const EXIGIDOS = [
  {
    nome: 'content-security-policy',
    forma: (v) => (/frame-ancestors/i.test(v) ? null : 'presente, mas sem frame-ancestors (clickjacking segue aberto)'),
  },
  {
    nome: 'strict-transport-security',
    forma: (v) => {
      const m = /max-age=(\d+)/i.exec(v);
      if (!m) return 'presente, mas sem max-age';
      const idade = Number(m[1]);
      return idade < HSTS_MIN ? `max-age=${idade}, abaixo do minimo declarado (${HSTS_MIN})` : null;
    },
  },
  {
    nome: 'x-content-type-options',
    forma: (v) => (v.trim().toLowerCase() === 'nosniff' ? null : `esperado nosniff, veio "${v}"`),
  },
  {
    nome: 'referrer-policy',
    forma: (v) => (/unsafe-url/i.test(v) ? 'unsafe-url vaza a URL inteira para terceiros' : null),
  },
];

async function buscar(url) {
  const opcoes = { redirect: 'follow', signal: AbortSignal.timeout(20000) };
  let res = await fetch(url, { ...opcoes, method: 'HEAD' });
  // Nem todo servidor responde HEAD. Cair para GET e correto; cair para exit 0 nao e.
  if (res.status === 405 || res.status === 501) {
    await res.body?.cancel();
    res = await fetch(url, { ...opcoes, method: 'GET' });
    return { res, metodo: 'GET (HEAD recusado)' };
  }
  return { res, metodo: 'HEAD' };
}

async function principal() {
  const alvo = (process.argv[2] ?? process.env.DEPLOY_URL ?? process.env.URL_PUBLICADA ?? '').trim();

  if (alvo === '') {
    console.error('headers:check precisa de uma URL publicada.');
    console.error('  node scripts/headers-check.mjs https://preview.exemplo.com.br');
    console.error('  ou defina DEPLOY_URL no ambiente (no CI, a URL de preview do deploy).');
    return FALHA;
  }

  let res;
  let metodo;
  try {
    ({ res, metodo } = await buscar(alvo));
  } catch (e) {
    console.error(`headers:check nao alcancou ${alvo}: ${e?.message ?? e}`);
    return FALHA;
  }

  const erros = [];

  for (const { nome, forma } of EXIGIDOS) {
    const valor = res.headers.get(nome);
    if (valor === null || valor.trim() === '') {
      erros.push(`${nome}: AUSENTE`);
      continue;
    }
    const problema = forma(valor);
    if (problema) erros.push(`${nome}: ${problema}`);
  }

  // Nao e cabecalho exigido, e sim cabecalho que nao deveria existir.
  const expoe = res.headers.get('x-powered-by');
  if (expoe) erros.push(`x-powered-by: expoe a stack ("${expoe}"); desligue no servidor`);

  console.log(`${alvo}  ->  ${res.status} (${metodo})`);
  await res.body?.cancel();

  // Status final (depois do redirect que `fetch` ja seguiu) >= 400: o portao mediu a pagina
  // de erro da plataforma — rota inexistente, ou preview protegido devolvendo 401 antes da
  // aplicacao responder — nunca a aplicacao. Cabecalho certo na pagina de erro nao prova nada
  // sobre o cabecalho da aplicacao de verdade.
  if (res.status >= 400) {
    erros.push(`status final ${res.status}: isso mede a pagina de erro, nao a aplicacao (rota errada ou preview protegido)`);
  }

  if (erros.length > 0) {
    console.error(`\n${erros.length} problema(s):`);
    for (const e of erros) console.error(`  - ${e}`);
    console.error('\nCorrija na configuracao da plataforma (vercel.json, middleware ou helmet) e faca deploy de novo.');
    return FALHA;
  }

  console.log(`cabecalhos OK: ${EXIGIDOS.map((e) => e.nome).join(', ')}`);
  return 0;
}

process.exitCode = await principal().catch((e) => {
  console.error(`headers:check quebrou: ${e?.message ?? e}`);
  return FALHA;
});
