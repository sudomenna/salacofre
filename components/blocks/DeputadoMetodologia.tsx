/**
 * components/blocks/DeputadoMetodologia.tsx
 *
 * O bloco de metodologia das duas telas de Deputado Federal (spec 017) — e por
 * que ele não é o `<ForecastTransparency>` que as outras três rotas usam.
 *
 * ## O que o componente compartilhado afirmaria de errado
 *
 * `<ForecastTransparency>` desenha duas barras, "Modelo" e "Apuração", com
 * `pctModel = 100 − pctApurado` (`components/blocks/ForecastTransparency.tsx`).
 * Com 71,4% apurado ele imprime **"Modelo 28,6%"**. No cargo 6 isso é falso, e
 * não por arredondamento: o design 017 § D10 fixa
 * `composition = {pre_election: 0, model: 0, actual_results: 1}` porque, hoje,
 * o número de cadeiras é a aritmética do ADR-0027 sobre o voto **já contado** —
 * não há prior, não há extrapolação, não há modelo (§ D9). A tela estaria
 * atribuindo 28,6% do resultado a um modelo que não rodou.
 *
 * O mesmo componente rotula a seção "O que está movendo o forecast" e afirma
 * "Esta projeção é feita no nível do estado". As duas frases são verdadeiras
 * nas outras rotas e falsas nesta. Editá-lo para servir aos dois casos
 * ampliaria o alcance da mudança para Presidente, Governador e Senador, que já
 * estão no ar; este bloco resolve sem tocar em nada que já funciona.
 *
 * ## O que continua sendo dito, porque é verdade
 *
 * Constituição § 8 pede que o leitor saiba de onde vem o número. Aqui: que
 * **não é projeção** (§ D9 é literal — "a tela não pode chamar isso de
 * projeção"), o percentual apurado, a granularidade de UF (escolha nossa, não
 * limitação do TSE — foi exatamente esse tipo de frase invertida que quebrou a
 * tela de Senador em 11/09) e a cadência.
 *
 * A cadência vem do payload (`atualizacao_min`, RF-128 / § D8), nunca de
 * literal. `cadenciaMinutos = 0` significa "não sabemos" — sem payload não há
 * cadência declarada — e o bloco **cala** sobre ela em vez de inventar um
 * número.
 *
 * Server Component puro: zero estado, zero evento, zero JS novo no bundle.
 */

import { Panel } from "@/components/atoms/surfaces/Panel";
import { formatPercent } from "@/lib/utils/format";

export interface DeputadoMetodologiaProps {
  /** Percentual apurado da abrangência (0–100). */
  pctApurado: number;
  /**
   * Minutos entre atualizações, vindo de `EdgePayloadDeputado.atualizacao_min`.
   * `0` (ou ausente) ⇒ nenhuma frase de cadência.
   */
  cadenciaMinutos: number;
  /** `"uf"` só troca o título; o texto é o mesmo, porque o método é o mesmo. */
  variant?: "national" | "uf";
}

export function DeputadoMetodologia({
  pctApurado,
  cadenciaMinutos,
  variant = "national",
}: DeputadoMetodologiaProps) {
  return (
    <Panel
      kicker="Metodologia"
      title={variant === "uf" ? "Como esta conta é feita" : "Como esta contagem é feita"}
      titleId="metodologia-heading"
    >
      <p
        className="max-w-prose"
        data-testid="dep-metodologia"
        style={{
          margin: 0,
          font: "var(--type-body-sm)",
          color: "var(--text-secondary)",
          textWrap: "pretty",
        }}
      >
        Estes números <strong>não são uma projeção</strong>. São a distribuição de cadeiras pelas
        regras do Código Eleitoral aplicada aos votos <strong>já apurados</strong> — a resposta para
        "como ficaria a bancada se a contagem parasse agora". Com {formatPercent(pctApurado)}{" "}
        apurado, ela ainda muda. Lemos o boletim que o TSE publica por estado, e não os de cada zona
        eleitoral — é escolha nossa, para caber no limite de requisições do TSE, e por isso não há
        mapa de municípios aqui.
        {cadenciaMinutos > 0 ? (
          <>
            {" "}
            Os números são atualizados a cada {cadenciaMinutos}{" "}
            {cadenciaMinutos === 1 ? "minuto" : "minutos"}.
          </>
        ) : null}
      </p>
    </Panel>
  );
}
