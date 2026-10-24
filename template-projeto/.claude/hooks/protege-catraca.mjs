#!/usr/bin/env node
// scripts/hooks/protege-catraca.mjs
// Evento: PreToolUse  ·  matcher: Write|Edit
//
// LIMITE DE SEGURANCA -> falha FECHADO (dicionario secao 5).
// O baseline e o teto de divida da catraca da Parte 14: a contagem so pode DESCER. Quem
// edita o baseline nao paga a divida, sobe o teto — e o D2 se resolve sozinho, no lugar
// errado. Por isso o baseline e o unico arquivo que o agente nao escreve.
//
// Quem grava o baseline legitimamente e o proprio alvo do portao (`lint` no estado 2),
// que roda como processo, nao como Write/Edit — o matcher estreito e o que deixa os dois
// conviverem. Apertar o teto continua automatico; afrouxar exige um humano.
//
// Saidas: 0 = liberado  ·  2 = bloqueado. Nunca um terceiro valor.

import { lerStdin, lerEvento, campo } from './payload.mjs';

const NOME = 'protege-catraca';
const BLOQUEIO = 2;

// Comparacao em minusculas: o sistema de arquivos do Windows nao diferencia .LintBaseline
// de .lintbaseline, e um portao que diferencia e um portao que se contorna com Shift.
const PROIBIDOS = [
  { re: /(^|\/)[^/]*baseline[^/]*\.json$/, motivo: 'baseline de catraca (json)' },
  { re: /(^|\/)[^/]*baseline[^/]*\.txt$/, motivo: 'baseline de catraca (txt)' },
  { re: /(^|\/)\.catraca\//, motivo: 'estado da catraca em .catraca/' },
  { re: /(^|\/)[^/]*\.lintbaseline[^/]*$/, motivo: 'baseline de lint' },
];

function negar(motivo, saida) {
  console.error(`BLOQUEADO por ${NOME}: ${motivo}`);
  console.error(saida);
  process.exit(BLOQUEIO);
}

async function principal() {
  const evento = lerEvento(await lerStdin());

  if (evento === null) {
    negar(
      'payload do harness ilegivel (vazio, quebrado, `null` ou array).',
      'Sem saber qual arquivo vai ser escrito, o hook nao libera. Edite voce mesmo, no editor.',
    );
  }

  const bruto = campo(evento, 'tool_input.file_path', 'toolInput.file_path', 'params.file_path', 'tool_input.path');
  if (bruto === '') {
    negar(
      'nao consegui ler o caminho do arquivo no evento do harness.',
      'Confira os nomes de campo na documentacao do seu harness.',
    );
  }

  const caminho = bruto.replace(/\\/g, '/').toLowerCase();

  for (const p of PROIBIDOS) {
    if (p.re.test(caminho)) {
      negar(
        `escrita em ${p.motivo}: ${bruto}`,
        'O teto so desce, e quem o reescreve e o portao ao rodar. Para afrouxar, edite fora da sessao e explique no PR.',
      );
    }
  }

  process.exit(0);
}

principal().catch((e) => negar(`o hook quebrou: ${e?.message ?? e}`, 'Conserte o hook ou desregistre-o explicitamente.'));
