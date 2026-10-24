#!/usr/bin/env node
// scripts/hooks/protege-segredo.mjs
// Evento: PreToolUse  ·  matcher: Write|Edit
//
// LIMITE DE SEGURANCA -> falha FECHADO (dicionario secao 5).
// Arquivo de segredo nao se edita dentro da sessao do agente: o conteudo escrito entra no
// contexto, o contexto entra no transcript, e o transcript nao tem rotacao de chave.
//
// Saidas: 0 = liberado  ·  2 = bloqueado. Nunca um terceiro valor.

import { lerStdin, lerEvento, campo } from './payload.mjs';

const NOME = 'protege-segredo';
const BLOQUEIO = 2;

// Comparacao em minusculas: o sistema de arquivos do Windows nao diferencia .ENV de .env,
// e um portao que diferencia e um portao que se contorna com Shift.
// O `(rc)?` e o `[.\-_/]` existem por dois arquivos reais que a primeira versao deixou passar:
// `.envrc` (do direnv, onde mora `export AWS_SECRET_ACCESS_KEY=...`) e `.env-backup` (o nome
// que se da ao arquivo minutos antes de rotacionar a chave). Os dois saiam 0.
// O padrao continua NAO casando `.environment-notes.md`: depois de `.env` vem `i`, que nao e
// delimitador nem `rc` — a diferenca entre fechar a brecha e criar um falso positivo semanal.
const PROIBIDOS = [
  { re: /(^|\/)\.env(rc)?($|[.\-_/])/, motivo: 'arquivo de variavel de ambiente' },
  { re: /\.pem$/, motivo: 'chave ou certificado PEM' },
  { re: /\.(p12|pfx)$/, motivo: 'keystore' },
  { re: /(^|\/)id_(rsa|ecdsa|ed25519)(\.|$)/, motivo: 'chave SSH privada' },
  { re: /(^|\/)credentials\.json$/, motivo: 'credencial de servico' },
];

// A unica excecao, e ela e a diferenca entre um portao usado e um portao contornado:
// .env.example carrega NOMES de variavel, nunca valores, e e exatamente o arquivo que voce
// quer que o agente mantenha em dia. O que impede valor real de entrar ali e `secrets:scan`
// (dicionario 2.5), nao este hook.
const LIBERADOS = [/(^|\/)\.env\.(example|sample|template)$/];

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

  if (LIBERADOS.some((re) => re.test(caminho))) process.exit(0);

  for (const p of PROIBIDOS) {
    if (p.re.test(caminho)) {
      negar(
        `escrita em ${p.motivo}: ${bruto}`,
        'Edite esse arquivo fora da sessao. Se o valor precisa existir no repositorio, ele nao e segredo (ver security/chaves-publicas.md).',
      );
    }
  }

  process.exit(0);
}

principal().catch((e) => negar(`o hook quebrou: ${e?.message ?? e}`, 'Conserte o hook ou desregistre-o explicitamente.'));
