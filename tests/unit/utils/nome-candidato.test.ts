/**
 * tests/unit/utils/nome-candidato.test.ts
 *
 * O nome que a tela mostra (`lib/utils/nome-candidato.ts`), pedido do dono em
 * 2026-09-14.
 *
 * ## O teste que este arquivo NÃO tem, de propósito
 *
 * Não existe aqui nenhum `expect(nomeExibicao(x)).toBeTruthy()`, nem
 * `.not.toBe("")`. Uma asserção dessas passa com o helper inteiro trocado por
 * `(n) => n` — ela mede que a função devolve alguma coisa, não que ela faz o
 * que foi pedido. É o defeito recorrente deste repositório e o motivo de cada
 * bloco abaixo nomear a MUTAÇÃO que ele mata.
 *
 * As três regras medidas, e a mutação que cada uma reprova:
 *
 *   M1 — decisão editorial por `sqcand`. Mutação: ignorar a tabela e devolver o
 *        cru. Morre porque o esperado é um literal DIFERENTE do cru.
 *   M2 — a chave é `sqcand`, nunca o nome. Mutação: casar por
 *        `nome.startsWith("FLAVIO")`. Morre no caso do mesmo nome com outro
 *        `sqcand`, que precisa sair intacto.
 *   M3 — a guarda das duas palavras. Mutação: trocar `palavras.length < 3` por
 *        `< 2`, que é o erro natural de quem relê a regra. Morre em
 *        "CAPITÃO AUGUSTO", que passaria a virar "AUGUSTO".
 *   M4 — as 30 decisões de Governador, uma a uma. Mutação: esvaziar a tabela
 *        editorial (deixar só as duas de Presidente). Morre 30 vezes, porque
 *        cada esperado é um literal DIFERENTE do nome de urna.
 *   M5 — o editorial VENCE a guarda de duas palavras nos três casos que a
 *        revogam. Mutação: rodar a regra objetiva antes da tabela. Morre em
 *        `DOUTORA NATASHA`/`SOLDADO SAMPAIO`/`PROFESSORA DORINHA`, e SÓ neles —
 *        nos outros 27 as duas ordens dão o mesmo resultado, que é o motivo de
 *        um teste genérico de "a tabela funciona" não pegar esta.
 *
 * Cada mutação foi APLICADA ao helper e a suíte foi rodada vermelha antes de
 * este arquivo ser dado por pronto — ver o relatório da tarefa.
 */

import { describe, expect, it } from "vitest";

import {
  NOMES_EDITORIAIS,
  nomeExibicao,
  PREFIXOS_OCUPACIONAIS,
  primeiroNomeExibicao,
} from "@/lib/utils/nome-candidato";

// `sq_candidato` reais, conferidos contra a tabela `candidatos` em 14/09.
const SQ_FLAVIO = "280002551544"; // FLAVIO BOLSONARO · PL
const SQ_CAIADO = "280002551932"; // RONALDO CAIADO · PSD
const SQ_GRASSI = "280002548139"; // VETERINÁRIO WILSON GRASSI · DEMOCRATA
const SQ_CURY = "280002551547"; // ESCRITOR AUGUSTO CURY · AVANTE
const SQ_LULA = "280002542548"; // LULA · PT

describe("M1 — a decisão editorial do dono, endereçada por sqcand", () => {
  it("os dois nomes que o dono escolheu saem CURTOS, e não como o TSE publica", () => {
    // 🔴 O esperado é um literal diferente da entrada. Com o helper desligado
    // (`(nome) => nome`) as duas linhas abaixo falham — que é o ponto.
    expect(nomeExibicao("FLAVIO BOLSONARO", SQ_FLAVIO)).toBe("FLAVIO");
    expect(nomeExibicao("RONALDO CAIADO", SQ_CAIADO)).toBe("CAIADO");
  });

  it("quem não está na tabela sai exatamente como veio", () => {
    // O par do teste acima: sem ele, um helper que devolvesse "CAIADO" para
    // todo mundo passaria no primeiro bloco.
    expect(nomeExibicao("LULA", SQ_LULA)).toBe("LULA");
    expect(nomeExibicao("PABLO MARÇAL", "280002553884")).toBe("PABLO MARÇAL");
    expect(nomeExibicao("RUI COSTA PIMENTA", "280002552487")).toBe("RUI COSTA PIMENTA");
  });

  it("a tabela tem exatamente as entradas decididas — nada entrou de carona", () => {
    // Presidente (2) + Governador (30). Uma entrada a mais aqui é uma pessoa
    // renomeada sem ninguém ter decidido — e, como o mesmo `sqcand` endereça a
    // foto (ADR-0041), com o rosto trocado junto.
    expect(Object.keys(NOMES_EDITORIAIS).sort()).toEqual(
      [SQ_FLAVIO, SQ_CAIADO, ...GOVERNADORES.map(([sq]) => sq)].sort(),
    );
  });
});

/**
 * M4 — as 30 decisões de Governador de 14/09.
 *
 * `[sqcand, nome de urna cru, nome que deve aparecer]`. Os `sqcand` foram
 * BUSCADOS no banco por `(uf, cargo=3, nome_urna)`, não transcritos: casaram
 * 1:1, sem homônimo e sem repetição. Os 30 cortavam com reticências em
 * `/uf/<UF>/governador` antes desta tabela — a coluna do nome mede 132px ali.
 */
const GOVERNADORES: ReadonlyArray<readonly [string, string, string]> = [
  ["40002541626", "PROFESSORA MARIA DO CARMO", "CARMO"], // AM
  ["40002541741", "ROBERTO CIDADE", "CIDADE"], // AM
  ["50002536314", "JERÔNIMO RODRIGUES", "RODRIGUES"], // BA
  ["50002532269", "RONALDO MANSUR", "MANSUR"], // BA
  ["60002543969", "ELMANO DE FREITAS", "FREITAS"], // CE
  ["70002552965", "PAULA BELMONTE", "BELMONTE"], // DF
  ["80002551833", "HELDER SALOMÃO", "SALOMÃO"], // ES
  ["80002552682", "LORENZO PAZOLINI", "PAZOLINI"], // ES
  ["80002552172", "RICARDO FERRAÇO", "FERRAÇO"], // ES
  ["90002545476", "LUIS CESAR BUENO", "BUENO"], // GO
  ["100002545679", "EDUARDO BRAIDE", "BRAIDE"], // MA
  ["100002543869", "ORLEANS BRANDÃO", "BRANDÃO"], // MA
  ["130002552296", "CLEITINHO AZEVEDO", "CLEITINHO"], // MG
  ["120002552191", "JOÃO HENRIQUE CATAN", "CATAN"], // MS
  ["110002544985", "DOUTORA NATASHA", "NATASHA"], // MT
  ["110002551480", "OTAVIANO PIVETTA", "PIVETTA"], // MT
  ["110002551737", "WELLINGTON FAGUNDES", "FAGUNDES"], // MT
  ["180002532987", "RAFAEL FONTELES", "FONTELES"], // PI
  ["220002541939", "MARCOS ROGÉRIO", "ROGÉRIO"], // RO
  ["230002549223", "ARTHUR HENRIQUE", "HENRIQUE"], // RR
  ["230002551571", "SOLDADO SAMPAIO", "SAMPAIO"], // RR
  ["210002535802", "MARCELO MARANATA", "MARANATA"], // RS
  ["240002551001", "JOÃO RODRIGUES", "RODRIGUES"], // SC
  ["240002537073", "JORGINHO MELLO", "JORGINHO"], // SC
  ["260002549466", "RICARDO MARQUES", "MARQUES"], // SE
  ["260002532010", "VALMIR DE FRANCISQUINHO", "FRANCISQUINHO"], // SE
  ["250002549705", "FERNANDO HADDAD", "HADDAD"], // SP
  ["270002544494", "LAUREZ MOREIRA", "MOREIRA"], // TO
  ["270002544599", "PROFESSORA DORINHA", "DORINHA"], // TO
  ["270002544544", "VICENTINHO JÚNIOR", "VICENTINHO"], // TO
];

describe("M4 — as 30 decisões editoriais de Governador", () => {
  it.each(GOVERNADORES)("%s · %s → %s", (sq, cru, esperado) => {
    // 🔴 O esperado é sempre um literal DIFERENTE do cru: com a tabela
    // esvaziada, as 30 falham. Uma asserção "devolve alguma coisa" passaria.
    expect(nomeExibicao(cru, sq)).toBe(esperado);
  });

  it("nenhum dos 30 devolve mais de UMA palavra — era a largura que cortava", () => {
    // O pedido era de largura, não de estética: a coluna do nome mede 132px na
    // página de estado. Um "encurtamento" que devolvesse duas palavras
    // resolveria zero e passaria no bloco acima se o esperado fosse frouxo.
    for (const [sq, cru] of GOVERNADORES) {
      expect(nomeExibicao(cru, sq).split(/\s+/), cru).toHaveLength(1);
    }
  });

  it("🔴 os três do diminutivo ficam com a PRIMEIRA palavra, não com a última", () => {
    // Mutação plausível e silenciosamente errada: "é sempre a última palavra".
    // Em nome de urna o diminutivo na frente É o nome pelo qual a pessoa é
    // chamada; a última palavra é o formal, que ninguém usa.
    expect(nomeExibicao("CLEITINHO AZEVEDO", "130002552296")).toBe("CLEITINHO");
    expect(nomeExibicao("JORGINHO MELLO", "240002537073")).toBe("JORGINHO");
    // E aqui a última palavra nem serviria: "JÚNIOR" sozinho não identifica.
    expect(nomeExibicao("VICENTINHO JÚNIOR", "270002544544")).toBe("VICENTINHO");
  });

  it("dois sobrenomes iguais em UFs diferentes são duas entradas, não uma", () => {
    // BA e SC caem ambos em "RODRIGUES". Se a tabela fosse indexada por nome —
    // ou se alguém "deduplicasse" os valores —, uma das duas sumiria.
    expect(nomeExibicao("JERÔNIMO RODRIGUES", "50002536314")).toBe("RODRIGUES");
    expect(nomeExibicao("JOÃO RODRIGUES", "240002551001")).toBe("RODRIGUES");
  });

  it("o rótulo curto da barra concorda com a linha nos 30", () => {
    // `primeiroNomeExibicao` corta DEPOIS da exibição. Sobre um nome de uma
    // palavra só isso é identidade — e é justamente isso que se afirma: nenhum
    // dos 30 pode aparecer como "Margem WELLINGTON" acima de "FAGUNDES".
    for (const [sq, cru, esperado] of GOVERNADORES) {
      expect(primeiroNomeExibicao(cru, sq), cru).toBe(esperado);
    }
  });
});

describe("M5 — 🔴 o editorial vence a guarda de duas palavras, caso a caso", () => {
  // Os três em que a regra objetiva e o dono discordam. Em todos, o prefixo é
  // de ofício e sobraria UMA palavra — exatamente o caso que a guarda existe
  // para preservar. O dono olhou os três e decidiu contra a guarda.
  const REVOGAM = [
    ["110002544985", "DOUTORA NATASHA", "NATASHA"],
    ["230002551571", "SOLDADO SAMPAIO", "SAMPAIO"],
    ["270002544599", "PROFESSORA DORINHA", "DORINHA"],
  ] as const;

  it.each(REVOGAM)("%s · com sqcand, sai a decisão do dono", (sq, cru, esperado) => {
    // 🔴 Esta é a asserção que morre se a regra objetiva rodar ANTES da tabela:
    // a guarda devolveria o cru e a decisão do dono sumiria em silêncio.
    expect(nomeExibicao(cru, sq)).toBe(esperado);
  });

  it.each(REVOGAM)("%s · SEM sqcand, a guarda continua valendo", (_sq, cru) => {
    // 🔴 O par indispensável. Sem ele, APAGAR a guarda passaria no bloco acima
    // e o teste não distinguiria "o editorial venceu" de "a guarda morreu" —
    // dois defeitos com a mesma cara e consequências opostas para os outros
    // milhares de nomes que dependem dela.
    expect(nomeExibicao(cru)).toBe(cru);
  });

  it("e a guarda segue intacta para quem NÃO está na tabela", () => {
    // O controle com o mesmo formato dos três: prefixo + uma palavra. Estes
    // não têm decisão editorial e têm de sair inteiros.
    expect(nomeExibicao("DOUTORA CLAUDIA", "999999999999")).toBe("DOUTORA CLAUDIA");
    expect(nomeExibicao("SOLDADO PRISCILA", "999999999998")).toBe("SOLDADO PRISCILA");
    expect(nomeExibicao("PROFESSORA HELENA", "999999999997")).toBe("PROFESSORA HELENA");
  });
});

describe("M2 — a chave é o sqcand, nunca a string do nome", () => {
  it("o MESMO nome com outro sqcand não recebe a decisão editorial", () => {
    // 🔴 Esta é a asserção que mata o `case` por nome. Um helper escrito como
    // `if (nome === "RONALDO CAIADO") return "CAIADO"` devolve "CAIADO" aqui e
    // falha — e falharia em produção no dia em que o TSE renomeasse alguém,
    // sem aviso nenhum.
    expect(nomeExibicao("RONALDO CAIADO", "999999999999")).toBe("RONALDO CAIADO");
    expect(nomeExibicao("FLAVIO BOLSONARO", "111111111111")).toBe("FLAVIO BOLSONARO");
  });

  it("sem sqcand a decisão editorial não se aplica — só a regra objetiva", () => {
    expect(nomeExibicao("RONALDO CAIADO")).toBe("RONALDO CAIADO");
    expect(nomeExibicao("RONALDO CAIADO", undefined)).toBe("RONALDO CAIADO");
    expect(nomeExibicao("RONALDO CAIADO", null)).toBe("RONALDO CAIADO");
    // mas o prefixo continua saindo, porque essa regra não depende de sqcand
    expect(nomeExibicao("VETERINÁRIO WILSON GRASSI")).toBe("WILSON GRASSI");
  });

  it("o editorial VENCE a regra de prefixo quando os dois poderiam agir", () => {
    // Ordem declarada no módulo. Sem ela, um nome editorial que começasse com
    // prefixo sairia truncado em vez de sair como o dono escreveu.
    expect(nomeExibicao("DOUTOR RONALDO CAIADO", SQ_CAIADO)).toBe("CAIADO");
  });
});

describe("a regra objetiva: prefixo de ofício ou patente sai, o nome fica", () => {
  it("os dois casos reais do cadastro presidencial de 2026", () => {
    expect(nomeExibicao("VETERINÁRIO WILSON GRASSI", SQ_GRASSI)).toBe("WILSON GRASSI");
    expect(nomeExibicao("ESCRITOR AUGUSTO CURY", SQ_CURY)).toBe("AUGUSTO CURY");
  });

  it("cobre as quatro famílias, e casa sem acento e com o ponto da abreviatura", () => {
    // patente · título/docência · religioso · ofício
    expect(nomeExibicao("CORONEL JOSÉ DA SILVA")).toBe("JOSÉ DA SILVA");
    expect(nomeExibicao("PROFESSORA MARIA CLARA")).toBe("MARIA CLARA");
    expect(nomeExibicao("PASTOR JOÃO BATISTA")).toBe("JOÃO BATISTA");
    expect(nomeExibicao("JORNALISTA CARLOS LIMA")).toBe("CARLOS LIMA");

    // "DR." é a 8ª forma mais frequente no cadastro real; o ponto tem de cair
    // na COMPARAÇÃO sem cair no nome que sobra.
    expect(nomeExibicao("DR. ROBERTO ALVES")).toBe("ROBERTO ALVES");
    expect(nomeExibicao("DRA. ANA PAULA")).toBe("ANA PAULA");
    // acento na entrada, entrada da lista sem acento
    expect(nomeExibicao("MÉDICO PEDRO SOUZA")).toBe("PEDRO SOUZA");
  });

  it("🔴 ponto é fronteira de token, igual a espaço — o furo dos 17 de 2026", () => {
    // O prefixo colado sem espaço passou despercebido até 14/09 porque o corte
    // olhava só para espaço e raspava pontuação só do FIM do token. São 17
    // candidaturas reais, a maioria em Deputado Federal — o cargo que alimenta
    // a grade "Quem está concorrendo".
    //
    // Casos REAIS do cadastro de 2026, não inventados:
    expect(nomeExibicao("DR.HILTON GONÇALO")).toBe("HILTON GONÇALO"); // MA, cargo 5
    expect(nomeExibicao("DR.CELSO VAZ")).toBe("CELSO VAZ"); // MG, cargo 6
    expect(nomeExibicao("DR.RICARDO AMANTINI")).toBe("RICARDO AMANTINI"); // SP, cargo 6

    // Segunda família: DOIS pontos. É por isso que a correção foi no
    // SEPARADOR e não na lista — com `DR.` e `DR..` como entradas, a próxima
    // variação de pontuação reabriria o mesmo buraco.
    expect(nomeExibicao("DR.. ALAN MELLO")).toBe("ALAN MELLO"); // RS, cargo 6
    expect(nomeExibicao("DR.. KEL GUIMARÃES")).toBe("KEL GUIMARÃES"); // AC, cargo 6
  });

  it("🔴 a guarda das duas palavras vale DEPOIS da normalização do separador", () => {
    // Com o ponto virando fronteira, estes passam a ser "prefixo + UMA
    // palavra" — exatamente o caso que a guarda existe para preservar. Se a
    // correção do separador tivesse passado por cima dela, "DR.RUI" viraria
    // "RUI" e o candidato ficaria irreconhecível.
    //
    // Todos reais (cargo 6, salvo DR.LUISINHO, cargo 3):
    expect(nomeExibicao("DR.RUI")).toBe("DR.RUI");
    expect(nomeExibicao("DR.ELOI")).toBe("DR.ELOI");
    expect(nomeExibicao("DR.WALBER")).toBe("DR.WALBER");
    expect(nomeExibicao("DR.TALMIR")).toBe("DR.TALMIR");
    expect(nomeExibicao("DR.LUISINHO")).toBe("DR.LUISINHO");
  });

  it("o resto sai como FATIA da string original — a pontuação de dentro fica", () => {
    // `split` + `join(" ")` remontaria o nome e normalizaria a pontuação
    // interna junto, em silêncio. O separador só é consumido onde separa o
    // prefixo do resto.
    expect(nomeExibicao("PROF. A.B. COSTA")).toBe("A.B. COSTA");
    // E o nome que a pessoa escolheu continua inteiro: "ADVOGADO DO POVO" e
    // "O PAI" não são designação de ofício em posição de prefixo, e não se
    // mexe neles (ambos reais, cargo 6).
    expect(nomeExibicao("DR.WASHINGTON ADVOGADO DO POVO")).toBe("WASHINGTON ADVOGADO DO POVO");
    expect(nomeExibicao("DR.DEINER SALOMÉ GOULART O PAI")).toBe("DEINER SALOMÉ GOULART O PAI");
  });

  it("só o PRIMEIRO token é candidato a prefixo — ofício no meio do nome fica", () => {
    // Mutação plausível: varrer o nome inteiro atrás de qualquer palavra da
    // lista. Ela quebraria um sobrenome legítimo.
    expect(nomeExibicao("MARIA PASTOR DE SOUZA")).toBe("MARIA PASTOR DE SOUZA");
  });

  it("a lista enumera OFÍCIOS, não ortografias — nenhuma entrada com pontuação", () => {
    // 🔴 A guarda da decisão de 14/09: o conserto do prefixo colado foi no
    // separador, e a lista NÃO deve crescer com `DR.`, `DR..`, `DR...`. Se
    // alguém as acrescentar, esta asserção reprova — e é de propósito, porque
    // a próxima variação de pontuação reabriria o buraco que acabou de fechar.
    for (const p of PREFIXOS_OCUPACIONAIS) {
      expect(p, `"${p}" tem pontuação — o separador já resolve isso`).not.toMatch(/[.·]/);
    }
  });

  it("a lista é de tokens de UMA palavra, sem acento e em caixa alta", () => {
    // Se alguém acrescentar "ASSISTENTE SOCIAL" ou "Delegado", a comparação
    // nunca casa e a entrada vira lixo silencioso.
    for (const p of PREFIXOS_OCUPACIONAIS) {
      expect(p, `"${p}" precisa ser uma palavra só`).not.toMatch(/\s/);
      expect(p, `"${p}" precisa estar em CAIXA ALTA`).toBe(p.toUpperCase());
      expect(p, `"${p}" precisa estar sem acento`).toBe(p.normalize("NFD").replace(/\p{M}/gu, ""));
    }
  });
});

describe("M3 — 🔴 a guarda das duas palavras", () => {
  it("não remove quando sobraria UMA palavra só — o ofício é metade da identidade", () => {
    // 🔴 A asserção do pedido do dono: "nunca produza nome de uma palavra só
    // que perca a identificação". Trocar a guarda `< 3` por `< 2` (o erro
    // natural de quem relê a regra) faz TODAS estas quatro falharem.
    expect(nomeExibicao("CAPITÃO AUGUSTO")).toBe("CAPITÃO AUGUSTO");
    expect(nomeExibicao("DOUTOR RAIMUNDO")).toBe("DOUTOR RAIMUNDO");
    expect(nomeExibicao("PROFESSORA ANA")).toBe("PROFESSORA ANA");
    expect(nomeExibicao("DR ROBERTO")).toBe("DR ROBERTO");
  });

  it("no limiar: 3 palavras removem, 2 não — o caso EXATAMENTE no corte", () => {
    // Teste de limiar precisa do caso NO limiar; um teste só com 4 palavras
    // passaria com a guarda escrita em qualquer lugar entre 2 e 4.
    expect(nomeExibicao("CORONEL ANA SILVA")).toBe("ANA SILVA"); // 3 → remove
    expect(nomeExibicao("CORONEL ANA")).toBe("CORONEL ANA"); // 2 → mantém
  });

  it("nunca devolve vazio a partir de entrada não-vazia", () => {
    // Inclui o nome que é SÓ o prefixo, que é o caminho mais curto para o vazio.
    for (const entrada of ["VETERINÁRIO", "DR", "PASTOR", "CORONEL", "X"]) {
      expect(nomeExibicao(entrada), entrada).toBe(entrada);
    }
    expect(nomeExibicao("  SOLDADO  ")).toBe("SOLDADO");
  });
});

describe("primeiroNomeExibicao — corta DEPOIS da exibição, não antes", () => {
  it("o rótulo curto concorda com a linha: CAIADO, nunca RONALDO", () => {
    // 🔴 Esta é a asserção do pedido: "senão 'MARGEM RONALDO' convive com
    // 'CAIADO' na linha de baixo". Um helper que cortasse o cru devolveria
    // "RONALDO" e falharia aqui — e SÓ aqui, porque `nomeExibicao` continuaria
    // certo. É o teste que separa as duas ordens de operação.
    expect(primeiroNomeExibicao("RONALDO CAIADO", SQ_CAIADO)).toBe("CAIADO");
    expect(primeiroNomeExibicao("FLAVIO BOLSONARO", SQ_FLAVIO)).toBe("FLAVIO");
  });

  it("e sobre o prefixo removido devolve o nome, não o ofício", () => {
    expect(primeiroNomeExibicao("VETERINÁRIO WILSON GRASSI", SQ_GRASSI)).toBe("WILSON");
    expect(primeiroNomeExibicao("ESCRITOR AUGUSTO CURY", SQ_CURY)).toBe("AUGUSTO");
  });

  it("sem decisão nem prefixo, é o primeiro nome de sempre", () => {
    expect(primeiroNomeExibicao("LULA", SQ_LULA)).toBe("LULA");
    expect(primeiroNomeExibicao("RUI COSTA PIMENTA")).toBe("RUI");
    // e, com a guarda ativa, o rótulo curto preserva o ofício que identifica
    expect(primeiroNomeExibicao("CAPITÃO AUGUSTO")).toBe("CAPITÃO");
  });
});
