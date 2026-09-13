// @vitest-environment happy-dom
/**
 * tests/unit/components/CandidateCard.test.tsx — RF-141 / RF-148 / RF-151.
 *
 * O caso que dá nome a este arquivo é o (c): **743 candidaturas estão na urna
 * com registro indeferido sob recurso e recebem voto de eleitor real em
 * 04/10** (ADR-0040). Escondê-las mentiria por omissão sobre quem está na
 * disputa; mostrá-las sem a ressalva mentiria por generalização. O único
 * desenho honesto é o card aparecer com a situação escrita ao lado — e o único
 * jeito de isso sobreviver a um refactor é um teste que falhe quando alguém
 * "limpar" o card.
 *
 * Mutações aplicadas e confirmadas em vermelho: esconder a ressalva (c),
 * normalizar o texto de situação para um enum (d), trocar `partyChipInk` por
 * `colorForParty` (f), e sempre montar URL de foto ignorando `foto_ok` (b).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CandidateCard } from "@/components/atoms/data/CandidateCard";
import type { CandidatoIdentidade } from "@/lib/blob/candidatos";

const BASE = "https://exemplo.public.blob.vercel-storage.com";
const ORIGINAL_BASE = process.env.BLOB_PUBLIC_BASE_URL;

beforeAll(() => {
  process.env.BLOB_PUBLIC_BASE_URL = BASE;
});
afterAll(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.BLOB_PUBLIC_BASE_URL;
  else process.env.BLOB_PUBLIC_BASE_URL = ORIGINAL_BASE;
});

function cand(over: Partial<CandidatoIdentidade> = {}): CandidatoIdentidade {
  return {
    sqcand: "250002553928",
    numero: 13,
    nome_urna: "LULA",
    nome: "Luiz Inácio Lula da Silva",
    partido: "PT",
    sob_ressalva: false,
    foto_ok: true,
    situacao_julgamento: "DEFERIDO",
    ...over,
  };
}

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<CandidateCard /> — identidade em texto (RF-151)", () => {
  it("(a) nome de urna, sigla e número estão em TEXTO, não só na imagem", () => {
    const texto = parse(<CandidateCard candidato={cand()} uf="BR" />).body.textContent ?? "";
    expect(texto).toContain("LULA");
    expect(texto).toContain("PT");
    expect(texto).toContain("13");
  });

  it("(b) `foto_ok=false` → fallback de iniciais e ZERO tag de imagem", () => {
    const doc = parse(<CandidateCard candidato={cand({ foto_ok: false })} uf="BR" />);
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(doc.querySelector("[data-testid='candidate-avatar-fallback']")).not.toBeNull();
  });

  it("(b2) `foto_ok=true` → a URL é derivada do caminho canônico do Blob", () => {
    const img = parse(<CandidateCard candidato={cand()} uf="SP" />).querySelector("img");
    // Derivada, nunca guardada na fatia (design 018 § D2): o `sqcand` e a UF
    // bastam. Se o esquema de caminho mudar, é aqui que aparece.
    expect(img?.getAttribute("src")).toBe(`${BASE}/candidatos/foto/SP/250002553928.jpg`);
  });

  it("(b3) sigla de UF malformada vira fallback, nunca exceção", () => {
    // `candidatoFotoBlobPathname` lança de propósito com sigla inválida. O card
    // não pode propagar isso: a moldura da página é obrigação da constituição
    // § 7. Sem o try/catch, este caso derruba o render inteiro.
    const doc = parse(<CandidateCard candidato={cand()} uf="ZZZ" />);
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(doc.querySelector("[data-testid='candidate-avatar-fallback']")).not.toBeNull();
  });
});

describe("<CandidateCard /> — situação de julgamento (RF-141, ADR-0040)", () => {
  it("(c) `sob_ressalva=true` → a situação APARECE no card", () => {
    const doc = parse(
      <CandidateCard
        candidato={cand({
          sob_ressalva: true,
          situacao_julgamento: "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO",
        })}
        uf="BA"
      />,
    );
    const ressalva = doc.querySelector("[data-testid='candidate-card-ressalva']");
    expect(ressalva).not.toBeNull();
    expect(ressalva?.textContent).toContain("INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO");
  });

  it("(c2) `sob_ressalva=false` → nada de ressalva", () => {
    const doc = parse(<CandidateCard candidato={cand()} uf="BR" />);
    expect(doc.querySelector("[data-testid='candidate-card-ressalva']")).toBeNull();
  });

  it("(d) o texto sai CRU do TSE — o componente não normaliza nem traduz", () => {
    // Valor propositalmente fora de qualquer enum plausível. Um conversor com
    // `default` silencioso (o defeito que já mordeu este repositório três
    // vezes) engoliria isto e mostraria outra coisa.
    const situacao = "PENDENTE DE JULGAMENTO (VALOR NOVO DO TSE)";
    const doc = parse(
      <CandidateCard
        candidato={cand({ sob_ressalva: true, situacao_julgamento: situacao })}
        uf="BR"
      />,
    );
    expect(doc.querySelector("[data-testid='candidate-card-ressalva']")?.textContent).toContain(
      situacao,
    );
  });

  it("(e) o card NÃO recalcula a regra: quem manda é `sob_ressalva`, não o texto", () => {
    // Contradição deliberada — situação "DEFERIDO" com a bandeira ligada. A
    // regra editorial mora na publicação (ADR-0040); refazê-la aqui num
    // `startsWith("DEFERIDO")` daria duas verdades sobre a mesma candidatura.
    const doc = parse(
      <CandidateCard
        candidato={cand({ sob_ressalva: true, situacao_julgamento: "DEFERIDO" })}
        uf="BR"
      />,
    );
    expect(doc.querySelector("[data-testid='candidate-card-ressalva']")).not.toBeNull();

    const inverso = parse(
      <CandidateCard
        candidato={cand({ sob_ressalva: false, situacao_julgamento: "INDEFERIDO" })}
        uf="BR"
      />,
    );
    expect(inverso.querySelector("[data-testid='candidate-card-ressalva']")).toBeNull();
  });
});

describe("<CandidateCard /> — cor e nome acessível", () => {
  it("(f) o chip usa o par `partyChipInk`, nunca `colorForParty` como área", () => {
    const chip = parse(<CandidateCard candidato={cand()} uf="BR" />).querySelector(
      "[data-testid='party-tag']",
    );
    const style = chip?.getAttribute("style") ?? "";

    // `--party-pt-chip` + `--party-pt-ink` é o par que o gerador mediu em
    // ≥ 4,5:1. `--party-pt` cru como fundo é a mutação que reprova WCAG.
    expect(style).toContain("var(--party-pt-chip)");
    expect(style).toContain("var(--party-pt-ink)");
    expect(style).not.toMatch(/var\(--party-pt\)/);
  });

  it("(g) o nome acessível do card junta nome, partido e número numa string", () => {
    const card = parse(<CandidateCard candidato={cand()} uf="BR" />).querySelector(
      "[data-testid='candidate-card']",
    );
    const label = card?.getAttribute("aria-label") ?? "";

    // WCAG 2.5.3: o nome acessível contém o texto visível. E é montado do dado
    // — trocar o candidato troca o rótulo (design 018 § D8).
    expect(label).toContain("LULA");
    expect(label).toContain("PT");
    expect(label).toContain("13");

    const outro = parse(
      <CandidateCard candidato={cand({ nome_urna: "ZÉ", partido: "PL", numero: 22 })} uf="BR" />,
    ).querySelector("[data-testid='candidate-card']");
    expect(outro?.getAttribute("aria-label")).not.toBe(label);
  });

  it("(h) federação aparece quando existe, e some quando não", () => {
    const com = parse(
      <CandidateCard candidato={cand({ federacao: "PT/PC do B/PV" })} uf="BR" />,
    ).querySelector("[data-testid='candidate-card-federacao']");
    expect(com?.textContent).toBe("PT/PC do B/PV");

    const sem = parse(<CandidateCard candidato={cand()} uf="BR" />).querySelector(
      "[data-testid='candidate-card-federacao']",
    );
    expect(sem).toBeNull();
  });

  it("(i) o nome COMPLETO não ocupa o card — só o de urna (RF-148)", () => {
    const texto = parse(<CandidateCard candidato={cand()} uf="BR" />).body.textContent ?? "";
    expect(texto).toContain("LULA");
    expect(texto).not.toContain("Luiz Inácio Lula da Silva");
  });
});
