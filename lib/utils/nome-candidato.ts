/**
 * lib/utils/nome-candidato.ts
 *
 * **Ponto único do nome de candidato que aparece na tela.** Camada de
 * EXIBIÇÃO: o payload continua carregando o nome de urna oficial do TSE, e
 * nada aqui é gravado, publicado, comparado ou usado como chave — a identidade
 * é `sqcand` (ADR-0042), nunca o nome.
 *
 * ## Por que um módulo, e não um `.replace()` em cada bloco
 *
 * Dois dias atrás a COR de um candidato divergia entre a home e a página de
 * estado porque cada tela a derivava por conta própria. Nome tem a mesma
 * exposição e a superfície é maior: uma varredura por `candidato.nome` acha
 * mais de uma dezena de blocos que o imprimem. Duas derivações do mesmo nome
 * divergem no primeiro caso composto e divergem **em silêncio** — ninguém
 * escreve teste para "as duas telas dizem a mesma coisa sobre a mesma pessoa".
 *
 * Junto veio a consolidação de `primeiroNome()`, que existia copiada em
 * `components/blocks/ResultPanel.tsx` e `components/blocks/StrongholdsPanel.tsx`.
 * Ela agora corta sobre o nome de EXIBIÇÃO e não sobre o cru: com o corte no
 * cru, o rótulo da figura diria "Margem RONALDO" três linhas acima de uma linha
 * escrita "CAIADO", e o leitor teria de deduzir que são a mesma pessoa.
 *
 * ## CAIXA ALTA permanece
 *
 * O TSE publica o nome de urna em maiúsculas e é assim que ele sai daqui. O
 * dono foi perguntado explicitamente em 14/09 e escolheu manter — não
 * reintroduzir caixa de título por CSS (`text-transform: capitalize`) nem por
 * dado. "MARÇAL" em caixa de título vira "Marçal"; "RUI COSTA PIMENTA" vira
 * "Rui Costa Pimenta"; e a primeira preposição composta ("DE", "DA", "DOS")
 * expõe que a regra de capitalização do português não cabe num `replace`.
 *
 * ## As duas regras, e a diferença entre elas
 *
 * 1. {@link NOMES_EDITORIAIS} — decisão do dono sobre PESSOAS ESPECÍFICAS,
 *    endereçada por `sqcand`. É subjetiva por natureza e por isso é uma lista
 *    fechada e explícita, nunca uma heurística. Cresce por decisão humana, uma
 *    linha por pessoa; crescer NÃO a transforma em regra.
 * 2. {@link PREFIXOS_OCUPACIONAIS} — regra OBJETIVA: "designação de ofício ou
 *    patente colada antes do nome não é nome". Não é escolha editorial sobre a
 *    pessoa, e é por isso que ela pode rodar sobre as 20 mil candidaturas sem
 *    passar por ninguém.
 *
 * 🔴 **A ordem importa e é contratual: o editorial vence.** Não é só o caso do
 * nome da lista que começa com prefixo — é o que permite ao dono revogar a
 * guarda de duas palavras pessoa a pessoa. Três entradas de Governador
 * (`DOUTORA NATASHA`, `SOLDADO SAMPAIO`, `PROFESSORA DORINHA`) dependem
 * inteiramente dela: se a regra objetiva rodasse antes, a guarda devolveria o
 * nome cru e a decisão do dono seria descartada em silêncio. Há teste sobre os
 * três exatamente por isso.
 */

/**
 * Nomes decididos pelo dono, endereçados por `sq_candidato` do TSE.
 *
 * 🔴 **Chave é `sqcand`, nunca o nome.** O nome de urna muda até o registro
 * final (substituição, indeferimento, renúncia de chapa), e um `case` por
 * string passaria a não casar em silêncio — a tela voltaria ao nome cru sem
 * nenhum sinal. `sqcand` é a identidade estável do ADR-0042.
 *
 * Todos os valores foram buscados no banco em 14/09, um a um, por
 * `(uf, cargo, nome_urna)` — **nunca transcritos de uma tabela em prosa**. Um
 * `sqcand` errado aqui não falha: ele renomeia a pessoa errada e, como o mesmo
 * número endereça a foto (ADR-0041), troca o rosto junto. Os 30 de Governador
 * casaram 1:1, sem homônimo e sem `sqcand` repetido. O comentário ao lado
 * guarda UF, nome cru e partido para quem for auditar — é documentação, o
 * código não o lê.
 *
 * ## Por que há uma lista, e por que ela cresceu de 2 para 32
 *
 * O problema é sempre o mesmo e é de LARGURA: a coluna do nome no placar mede
 * 132px na página de estado e ~137px na home. Acima disso o nome era cortado
 * com reticências ("VALMIR DE FRANCISQU…"), e um nome cortado não identifica
 * ninguém — que é o oposto do que o placar existe para fazer. Medido em 14/09
 * no navegador: os 30 nomes de Governador abaixo cortavam, TODOS, em
 * `/uf/<UF>/governador`.
 *
 * Encurtar é decisão editorial e não tem regra: "o sobrenome pelo qual a pessoa
 * é conhecida" não é derivável do nome de urna. Por isso lista fechada,
 * explícita, conferida — nunca heurística.
 *
 * ## Três que mantêm a PRIMEIRA palavra, de propósito
 *
 * `CLEITINHO`, `JORGINHO` e `VICENTINHO` contrariam o padrão "última palavra" —
 * e não são engano. Em nome de urna, o diminutivo na frente É o nome pelo qual
 * a pessoa é chamada; o sobrenome atrás é o formal, que ninguém usa. Em
 * "VICENTINHO JÚNIOR" é ainda a única saída: `JÚNIOR` sozinho não identifica
 * ninguém, e o nome inteiro corta igual. Quem "corrigir" para a última palavra
 * troca o nome público pelo cartorial nos três.
 *
 * ## Três que REVOGAM a guarda de duas palavras, caso a caso
 *
 * `DOUTORA NATASHA` → `NATASHA`, `SOLDADO SAMPAIO` → `SAMPAIO`,
 * `PROFESSORA DORINHA` → `DORINHA`. A guarda de {@link nomeExibicao} existe
 * justamente para não produzir esses três cortes sozinha, e ela **continua
 * valendo para todo o resto** — o que a decisão editorial faz é vencê-la nestes
 * três, um a um, com o dono tendo olhado cada um. É por isso que a ordem do
 * módulo (editorial ANTES da regra objetiva) não é detalhe de implementação: é
 * o que torna a revogação possível. Há teste sobre os três.
 */
export const NOMES_EDITORIAIS: Readonly<Record<string, string>> = {
  // ─── Presidente (cargo 1) ───
  // Os dois são compridos o bastante para empurrar o selo do partido para uma
  // segunda linha na coluna de 400px, enquanto "LULA" cabe com o selo ao lado —
  // e a lista fica com linhas de alturas diferentes.
  "280002551544": "FLAVIO", // BR · FLAVIO BOLSONARO · PL
  "280002551932": "CAIADO", // BR · RONALDO CAIADO · PSD

  // ─── Governador (cargo 3) — as 30 decisões de 14/09 ───
  "40002541626": "CARMO", // AM · PROFESSORA MARIA DO CARMO · PL
  "40002541741": "CIDADE", // AM · ROBERTO CIDADE · UNIÃO
  "50002536314": "RODRIGUES", // BA · JERÔNIMO RODRIGUES · PT
  "50002532269": "MANSUR", // BA · RONALDO MANSUR · PSOL
  "60002543969": "FREITAS", // CE · ELMANO DE FREITAS · PT
  "70002552965": "BELMONTE", // DF · PAULA BELMONTE · PSDB
  "80002551833": "SALOMÃO", // ES · HELDER SALOMÃO · PT
  "80002552682": "PAZOLINI", // ES · LORENZO PAZOLINI · REPUBLICANOS
  "80002552172": "FERRAÇO", // ES · RICARDO FERRAÇO · MDB
  "90002545476": "BUENO", // GO · LUIS CESAR BUENO · PT
  "100002545679": "BRAIDE", // MA · EDUARDO BRAIDE · PSD
  "100002543869": "BRANDÃO", // MA · ORLEANS BRANDÃO · MDB
  "130002552296": "CLEITINHO", // MG · CLEITINHO AZEVEDO · REPUBLICANOS — 1ª palavra
  "120002552191": "CATAN", // MS · JOÃO HENRIQUE CATAN · NOVO
  "110002544985": "NATASHA", // MT · DOUTORA NATASHA · PSD — revoga a guarda
  "110002551480": "PIVETTA", // MT · OTAVIANO PIVETTA · REPUBLICANOS
  "110002551737": "FAGUNDES", // MT · WELLINGTON FAGUNDES · PL
  "180002532987": "FONTELES", // PI · RAFAEL FONTELES · PT
  "220002541939": "ROGÉRIO", // RO · MARCOS ROGÉRIO · PL
  "230002549223": "HENRIQUE", // RR · ARTHUR HENRIQUE · PL
  "230002551571": "SAMPAIO", // RR · SOLDADO SAMPAIO · REPUBLICANOS — revoga a guarda
  "210002535802": "MARANATA", // RS · MARCELO MARANATA · PSDB
  "240002551001": "RODRIGUES", // SC · JOÃO RODRIGUES · PSD
  "240002537073": "JORGINHO", // SC · JORGINHO MELLO · PL — 1ª palavra
  "260002549466": "MARQUES", // SE · RICARDO MARQUES · PL
  "260002532010": "FRANCISQUINHO", // SE · VALMIR DE FRANCISQUINHO · REPUBLICANOS
  "250002549705": "HADDAD", // SP · FERNANDO HADDAD · PT
  "270002544494": "MOREIRA", // TO · LAUREZ MOREIRA · PSD
  "270002544599": "DORINHA", // TO · PROFESSORA DORINHA · UNIÃO — revoga a guarda
  "270002544544": "VICENTINHO", // TO · VICENTINHO JÚNIOR · PSDB — 1ª palavra
};

/**
 * Designações de ofício e patente que aparecem coladas antes do nome de urna.
 *
 * **Uma palavra por entrada, sem acento, em maiúsculas e SEM PONTUAÇÃO.** A
 * comparação normaliza o acento do token do nome ("VETERINÁRIO" casa com
 * `VETERINARIO`), e a pontuação nem chega aqui: ela é fronteira de token, então
 * "DR.", "DR. " e "DR.." todos reduzem a `DR` antes da comparação. Ver
 * {@link SEPARADOR} — é lá que essa decisão vive, e ela é a razão de esta lista
 * **não** conter `DR.`/`DR..`. Há teste reprovando entrada com pontuação.
 *
 * Para estender, basta acrescentar o ofício à lista: é o único lugar.
 *
 * A lista **não tenta ser o catálogo de profissões do Brasil** — ela cobre as
 * famílias que de fato ocorrem em nome de urna, e a guarda de duas palavras
 * abaixo limita o estrago de um falso positivo. Conferida contra o cadastro
 * INTEIRO de 2026 (8.323 candidaturas, os quatro cargos): a regra altera 647
 * nomes, 609 deles em Deputado Federal — que é o cargo com 20 mil candidaturas
 * e o que alimenta a grade "Quem está concorrendo".
 *
 * ## O que ficou DE FORA, de propósito
 *
 * Abreviaturas de 2–3 letras que são também nome, sigla de estado ou apelido:
 * `SD`, `PM`, `TEN`, `CEL`, `CAP`, `GAL`, `PR`, `PRA`, `AP`, `VET`, `REV`.
 * "GAL" pode ser "General" ou o apelido; "PR" é tanto "Pastor" quanto Paraná;
 * "AP", tanto "Apóstolo" quanto Amapá. Sem jeito objetivo de decidir, não se
 * remove. Medido em 14/09: 15 candidaturas do cadastro usam uma dessas formas
 * seguida de ponto e passariam a cortar se entrassem — decisão consciente de
 * não cortar, não esquecimento.
 *
 * `DR` e `DRA` entram porque são inequívocos (não há prenome "Dr") e são, de
 * longe, os mais frequentes.
 */
export const PREFIXOS_OCUPACIONAIS: readonly string[] = [
  // --- patente militar, polícia e segurança ---
  "SOLDADO",
  "CABO",
  "SARGENTO",
  "SARGENTA",
  "SGT",
  "SUBTENENTE",
  "TENENTE",
  "CAPITAO",
  "MAJOR",
  "CORONEL",
  "GENERAL",
  "ALMIRANTE",
  "BRIGADEIRO",
  "COMANDANTE",
  "DELEGADO",
  "DELEGADA",
  "INSPETOR",
  "INSPETORA",
  "INVESTIGADOR",
  "INVESTIGADORA",
  "POLICIAL",
  "GUARDA",
  "BOMBEIRO",
  "BOMBEIRA",
  "VIGILANTE",

  // --- título acadêmico e docência ---
  "DR",
  "DRA",
  "DOUTOR",
  "DOUTORA",
  "PROF",
  "PROFA",
  "PROFESSOR",
  "PROFESSORA",
  "MESTRE",
  "ENGENHEIRO",
  "ENGENHEIRA",
  "ARQUITETO",
  "ARQUITETA",
  "ECONOMISTA",
  "SOCIOLOGO",
  "SOCIOLOGA",
  "HISTORIADOR",
  "HISTORIADORA",
  "AGRONOMO",
  "AGRONOMA",
  "ZOOTECNISTA",
  "BIOLOGO",
  "BIOLOGA",

  // --- religioso ---
  "PASTOR",
  "PASTORA",
  "PADRE",
  "BISPO",
  "BISPA",
  "APOSTOLO",
  "APOSTOLA",
  "MISSIONARIO",
  "MISSIONARIA",
  "EVANGELISTA",
  "DIACONO",
  "DIACONISA",
  "REVERENDO",
  "FREI",
  "IRMAO",
  "IRMA",
  "RABINO",

  // --- saúde ---
  "MEDICO",
  "MEDICA",
  "ENFERMEIRO",
  "ENFERMEIRA",
  "DENTISTA",
  "VETERINARIO",
  "VETERINARIA",
  "PSICOLOGO",
  "PSICOLOGA",
  "FARMACEUTICO",
  "FARMACEUTICA",
  "FISIOTERAPEUTA",
  "NUTRICIONISTA",

  // --- jurídico, contábil e serviço público ---
  "ADVOGADO",
  "ADVOGADA",
  "JUIZ",
  "JUIZA",
  "PROMOTOR",
  "PROMOTORA",
  "PROCURADOR",
  "PROCURADORA",
  "DEFENSOR",
  "DEFENSORA",
  "AUDITOR",
  "AUDITORA",
  "CONTADOR",
  "CONTADORA",
  "ADMINISTRADOR",
  "ADMINISTRADORA",
  "SERVIDOR",
  "SERVIDORA",
  "DESPACHANTE",

  // --- ofício, comércio e campo ---
  "JORNALISTA",
  "RADIALISTA",
  "ESCRITOR",
  "ESCRITORA",
  "EMPRESARIO",
  "EMPRESARIA",
  "COMERCIANTE",
  "CORRETOR",
  "CORRETORA",
  "MOTORISTA",
  "CAMINHONEIRO",
  "CAMINHONEIRA",
  "TAXISTA",
  "MOTOTAXISTA",
  "MOTOBOY",
  "PEDREIRO",
  "ELETRICISTA",
  "MECANICO",
  "SAPATEIRO",
  "BARBEIRO",
  "CABELEIREIRO",
  "CABELEIREIRA",
  "PADEIRO",
  "COZINHEIRO",
  "COZINHEIRA",
  "FEIRANTE",
  "AMBULANTE",
  "AGRICULTOR",
  "AGRICULTORA",
  "PESCADOR",
  "PESCADORA",
  "GARI",
  "ARTESAO",
  "ARTESA",
  "FOTOGRAFO",
  "FOTOGRAFA",
  "MUSICO",
  "MUSICA",
  "CANTOR",
  "CANTORA",
  "PILOTO",
];

/** Conjunto normalizado — construído uma vez, não por chamada. */
const PREFIXOS = new Set(PREFIXOS_OCUPACIONAIS);

/**
 * 🔴 **Ponto e espaço são a MESMA coisa: fronteira de token.**
 *
 * Esta é a correção de 2026-09-14, e o que ela conserta é um buraco que custou
 * 17 candidaturas. Antes, o corte olhava só para espaço e a pontuação era
 * raspada do FIM do token — o que resolvia "DR. ROBERTO" e não resolvia nada
 * escrito sem o espaço:
 *
 *   `DR.HILTON GONÇALO` · `DR.CELSO VAZ` · `DR.RICARDO AMANTINI` · `DR.YAGO
 *   TORRES` · `DR.RAIMUNDO CASTRO` · `DR.HELTON MESQUITA` · `DR..ALAN MELLO` …
 *
 * — 17 no cadastro de 2026, a maioria em Deputado Federal, que é o cargo com
 * 20 mil candidaturas e o que alimenta a grade "Quem está concorrendo".
 *
 * **A correção é no SEPARADOR, não na lista.** Acrescentar `DR.`, `DR..` e
 * `DR...` como entradas resolveria estes 17 e reabriria o mesmo buraco na
 * próxima variação de pontuação que um cartório aceite — e a lista existe para
 * enumerar OFÍCIOS, não ortografias. Tratando `.` como fronteira, qualquer
 * quantidade de pontos, antes ou depois, passa a casar de graça.
 */
const SEPARADOR = /[\s.·]+/;

/** Token comparável: sem acento, em maiúsculas. */
function normalizar(palavra: string): string {
  return palavra
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * O nome como ele deve aparecer na tela.
 *
 * Ordem: decisão editorial (por `sqcand`) → remoção de prefixo ocupacional →
 * o nome cru, sem alteração.
 *
 * 🔴 **A guarda das duas palavras.** O prefixo só sai se sobrarem ao menos
 * DUAS palavras. É estritamente mais conservador do que a regra que o dono
 * enunciou ("não remova se sobrar menos de duas palavras E o restante não for
 * reconhecível sozinho"), e de propósito: "reconhecível sozinho" não é
 * decidível por máquina, e o lado seguro do erro está escrito no pedido — "é
 * melhor um nome comprido que um candidato irreconhecível".
 *
 * Ela não é teórica. "CAPITÃO AUGUSTO", "DOUTOR RAIMUNDO", "PROFESSORA ANA",
 * "DR ROBERTO" — em todos, o ofício É metade da identidade pública, e cortá-lo
 * deixaria uma tela com "AUGUSTO" e outra pessoa chamada "AUGUSTO" logo abaixo.
 * Com a guarda, esses quatro saem daqui idênticos à entrada.
 *
 * A guarda roda **depois** da normalização do separador, e é ela que mantém
 * `DR.RUI`, `DR.ELOI`, `DR.WALBER`, `DR.TALMIR` e `DR.LUISINHO` intactos: com o
 * ponto virando fronteira eles passam a ser "prefixo + uma palavra", que é
 * exatamente o caso que a guarda existe para preservar.
 *
 * Nunca devolve vazio a partir de entrada não-vazia: os dois caminhos que
 * alteram a string ou devolvem uma constante da lista editorial, ou devolvem
 * pelo menos duas palavras do original.
 *
 * @param nome  Nome de urna cru do payload (`EdgeCandidate.nome`,
 *              `CandidatoIdentidade.nome_urna`, `top_candidatos[].nome`).
 * @param sqcand `SQ_CANDIDATO` quando o escopo o tiver. Ausente é normal e não
 *               é erro: nos cargos 3 e 5 o bloco nacional não o carrega por
 *               contrato (RF-145). Sem ele, só a regra objetiva roda.
 */
export function nomeExibicao(nome: string, sqcand?: string | null): string {
  const editorial = sqcand ? NOMES_EDITORIAIS[sqcand] : undefined;
  if (editorial) return editorial;

  const bruto = (nome ?? "").trim();

  /*
   * Recorta o PRIMEIRO token e o separador que vem depois dele, e nada mais.
   *
   * O resto sai como uma FATIA DA STRING ORIGINAL, não remontado a partir de
   * tokens: `split` + `join(" ")` normalizaria a pontuação de dentro do nome
   * junto, e "PROF. A.B. COSTA" viraria "A B COSTA" em silêncio. O separador é
   * consumido só onde ele separa o prefixo do resto.
   *
   * Sem separador nenhum (nome de um token só), não há o que cortar.
   */
  const corte = /^([^\s.·]+)[\s.·]+(.*)$/s.exec(bruto);
  if (!corte) return bruto;

  const primeiro = corte[1] as string;
  const resto = (corte[2] as string).trim();

  if (!PREFIXOS.has(normalizar(primeiro))) return bruto;
  // Sobrar menos de duas palavras ⇒ não remove. Ver a guarda acima.
  if (resto.split(SEPARADOR).filter(Boolean).length < 2) return bruto;

  return resto;
}

/**
 * Primeiro nome do nome de EXIBIÇÃO — o rótulo curto ("Margem LULA", rótulo do
 * segmento da barra).
 *
 * Era `primeiroNome()`, copiado em dois blocos. Passa a cortar depois de
 * {@link nomeExibicao} pela razão escrita no topo do arquivo: cortar o cru
 * produziria "Margem RONALDO" no mesmo painel em que a linha diz "CAIADO".
 *
 * O `||` final cobre a entrada só de espaços, em que o `split` devolve `[""]`.
 */
export function primeiroNomeExibicao(nome: string, sqcand?: string | null): string {
  const exibicao = nomeExibicao(nome, sqcand);
  return exibicao.split(/\s+/)[0] || exibicao;
}
