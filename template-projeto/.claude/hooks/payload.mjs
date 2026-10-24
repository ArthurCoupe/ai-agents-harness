// scripts/payload.mjs
// Leitura segura do evento do harness. Zero dependencia externa.
// Dicionario secao 5: "Todo hook le stdin com o helper de leitura segura".
//
// Sem acento em nenhuma mensagem: o stderr do hook passa pelo console do Windows,
// que pode nao estar em UTF-8, e acento vira lixo justamente na linha que precisa ser lida.

const TETO_MS = 2000;

/**
 * Le o stdin inteiro e devolve o texto cru.
 * NUNCA lanca e NUNCA rejeita: qualquer falha vira string vazia.
 * - stdin em TTY significa que ninguem canalizou nada; ler bloquearia para sempre.
 * - o teto de 2 s e uma decisao declarada: se o harness abrir o processo e nao entregar
 *   payload, devolve o que tiver em vez de segurar a sessao. Quem decide o que fazer com
 *   o vazio e o hook, pela classe dele (fechado bloqueia, aberto libera).
 * @returns {Promise<string>}
 */
export function lerStdin() {
  return new Promise((resolve) => {
    try {
      if (process.stdin.isTTY) return resolve('');

      let dados = '';
      let encerrado = false;
      let relogio = null;

      const fim = () => {
        if (encerrado) return;
        encerrado = true;
        if (relogio) clearTimeout(relogio);
        resolve(dados);
      };

      relogio = setTimeout(fim, TETO_MS);
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (p) => { dados += p; });
      process.stdin.on('end', fim);
      process.stdin.on('error', fim);
      process.stdin.on('close', fim);
    } catch {
      resolve('');
    }
  });
}

/**
 * Texto cru -> objeto do evento, ou null.
 *
 * As quatro falhas colapsam num sinal so (null), porque a resposta do hook e a mesma
 * para todas: nao da para saber o que vai acontecer.
 *   ''            -> null   (payload vazio)
 *   '{"tool_in'   -> null   (JSON quebrado; JSON.parse lanca)
 *   'null'        -> null   (JSON.parse NAO lanca, devolve null: a armadilha)
 *   '[]'          -> null   (typeof [] === 'object', entao a guarda ingenua passa)
 *
 * @param {unknown} bruto
 * @returns {Record<string, unknown> | null}
 */
export function lerEvento(bruto) {
  const texto = String(bruto ?? '').trim();   // trim() ja remove o BOM (U+FEFF)
  if (texto === '') return null;

  let valor;
  try {
    valor = JSON.parse(texto);
  } catch {
    return null;
  }

  // JSON.parse('null') devolve null SEM lancar, e typeof null === 'object'.
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return valor;
}

/**
 * Primeiro caminho que existir com string nao vazia. '' se nenhum.
 * Os caminhos saem da documentacao do seu harness (Parte 15.5); nao invente um quarto.
 * @param {unknown} obj
 * @param {...string} caminhos
 * @returns {string}
 */
export function campo(obj, ...caminhos) {
  if (obj === null || typeof obj !== 'object') return '';
  for (const caminho of caminhos) {
    const v = caminho.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
}
