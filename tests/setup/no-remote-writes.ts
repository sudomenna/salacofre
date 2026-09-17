/**
 * tests/setup/no-remote-writes.ts
 *
 * **Carregado antes de todo arquivo de teste.** Existe por causa de um
 * incidente, e a única coisa que ele faz é apontar o caminho de publicação do
 * orchestrator para uma porta onde nunca há ninguém.
 *
 * ## O incidente (2026-09-14 02:10 UTC)
 *
 * O site público exibiu "CANDIDATO 100 — 55,0% — 100% apurado" três semanas
 * antes do pleito. Sem deploy, sem cron, sem semeador. A cadeia:
 *
 *   1. `pnpm dev` de pé na 3000 para conferir uma tela no browser;
 *   2. `pnpm dev` carrega `.env.local`, que tem as credenciais **de
 *      produção** do Global Config — o servidor local escreve na loja real;
 *   3. a suíte rodou. Parte dela executa o orchestrator Python, que ao
 *      terminar chama `post_edge_write`; sem `INTERNAL_BASE_URL`,
 *      `_resolve_internal_base_url` (`api/model/project.py:3018-3030`) cai em
 *      `http://localhost:${PORT:-3000}`;
 *   4. **normalmente não há nada escutando** ali, a conexão morre, o teste
 *      passa, e ninguém nunca soube que essa linha de fuga existia. Naquele
 *      minuto havia alguém escutando.
 *
 * ## Por que a correção é esta, e não "limpar `MODEL_SECRET`"
 *
 * Vários testes **precisam** de `MODEL_SECRET` — eles exercitam o caminho de
 * escrita com `fetch`/`urlopen` mockado, e apagá-lo aqui os faria testar o
 * early-return em vez do que foram escritos para testar. O que precisa morrer
 * não é a intenção de publicar, é o **destino**: com a base apontada para uma
 * porta morta, um teste que esqueça de neutralizar o segredo falha ao
 * conectar, exatamente como sempre falhou quando ninguém estava de pé na
 * 3000 — só que agora por construção, e não por sorte.
 *
 * Porta 9 é `discard` (RFC 863). Nunca há serviço ali, e `127.0.0.1` recusa
 * na hora em vez de esperar timeout.
 *
 * ⚠️ Um teste que precise de um destino próprio **pode** sobrescrever
 * `process.env.INTERNAL_BASE_URL` no próprio corpo; este arquivo só troca o
 * default. O que ele impede é o **esquecimento**.
 */

const PORTA_MORTA = "http://127.0.0.1:9";

process.env.INTERNAL_BASE_URL = PORTA_MORTA;

// `_resolve_internal_base_url` consulta `VERCEL_URL` antes de cair no
// localhost. Quem rodou `. ./.env.local` num shell que já tinha essa variável
// exportada levaria a publicação para a URL de uma deployment real — o mesmo
// incidente, com destino pior.
delete process.env.VERCEL_URL;

// `PORT` compõe o fallback de localhost. Zerá-la não basta (o default é 3000),
// mas deixá-la divergente confundiria quem for depurar isto depois.
process.env.PORT = "9";
