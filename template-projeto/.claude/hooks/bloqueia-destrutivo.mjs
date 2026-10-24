#!/usr/bin/env node
// .claude/hooks/bloqueia-destrutivo.mjs
// Evento: PreToolUse  ·  matcher: Bash
//
// LIMITE DE SEGURANCA -> falha FECHADO (dicionario secao 5).
// Comando ilegivel bloqueia. Custo do falso positivo: voce roda o comando no seu terminal.
// Custo do falso negativo: banco apagado ou historico reescrito no remoto.
//
// Saidas: 0 = liberado  ·  2 = bloqueado. Nunca um terceiro valor.

import { lerStdin, lerEvento, campo } from './payload.mjs';

const NOME = 'bloqueia-destrutivo';
const BLOQUEIO = 2;

const PROIBIDOS = [
  { re: /\bprisma\s+migrate\s+reset\b/i, motivo: 'apaga o banco inteiro e reaplica do zero' },
  { re: /\bprisma\s+migrate\s+dev\b/i, motivo: 'pode dropar o banco em caso de drift; use migrate deploy' },
  { re: /\bprisma\s+db\s+push\b/i, motivo: 'muda o schema sem migration versionada' },
  // Sem flag, a CLI recria so o banco local do Docker, que migration e semente refazem
  // (documentacao oficial do `supabase db reset`, conferida em 2026-10-05). --linked e --db-url
  // apontam para banco remoto: esses continuam bloqueados.
  { re: /\bsupabase\s+db\s+reset\b[^\n;&|]*--(linked|db-url)\b/i, motivo: 'recria um banco remoto do zero; o reset local e sem --linked e sem --db-url' },
  { re: /\b(drop|truncate)\s+(table|schema|database)\b/i, motivo: 'DDL destrutivo direto' },
  { re: /\bdb:(reset|drop|nuke)\b/i, motivo: 'script de reset do package.json' },
  { re: /\bgit\s+reset\s+--hard\b/i, motivo: 'descarta a arvore de trabalho sem reflog do que nao foi commitado' },
  // --force-with-lease e a variante SEGURA: ela aborta se o remoto andou.
  // O lookahead existe para nao treinar o leitor a contornar o portao no caso certo.
  { re: /\bgit\s+push\b[^\n;&|]*(--force(?!-with-lease|-if-includes)|(?:^|\s)-f(?=\s|$))/i,
    motivo: 'reescreve o historico do remoto; use --force-with-lease' },
  { re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, motivo: 'remocao recursiva forcada' },
];

function negar(motivo, saida) {
  console.error(`BLOQUEADO por ${NOME}: ${motivo}`);
  console.error(saida);
  process.exit(BLOQUEIO);
}

async function principal() {
  const evento = lerEvento(await lerStdin());

  // null cobre os quatro casos de payload ilegivel, inclusive o literal `null`,
  // que JSON.parse devolve SEM lancar. Fechado: ilegivel bloqueia.
  if (evento === null) {
    negar(
      'payload do harness ilegivel (vazio, quebrado, `null` ou array).',
      'Sem saber o que vai rodar, o hook nao libera. Rode o comando no seu proprio terminal.',
    );
  }

  const comando = campo(evento, 'tool_input.command', 'toolInput.command', 'params.command');
  if (comando === '') {
    negar(
      'nao consegui ler o comando no evento do harness.',
      'Confira os nomes de campo na documentacao do seu harness. Ate la, rode o comando voce mesmo.',
    );
  }

  for (const p of PROIBIDOS) {
    if (p.re.test(comando)) {
      negar(
        `comando destrutivo (${p.motivo}): ${comando}`,
        'Se for intencional, rode voce mesmo, fora da sessao do agente.',
      );
    }
  }

  process.exit(0);
}

// Sem este catch, uma rejeicao nao tratada termina o processo com 1:
// nem o 0 de liberar, nem o 2 de bloquear.
principal().catch((e) => negar(`o hook quebrou: ${e?.message ?? e}`, 'Conserte o hook ou desregistre-o explicitamente.'));
