// <VisualPdf spec /> — the react-pdf twin of every report visual (S-R4).
//
// Spec §A.3 / §C.4: "react-pdf SVG primitives in PDF … same renderer". The
// twin does not re-implement any chart: it runs the SAME `renderVisual(spec)`
// the web uses, parses the strict SVG subset our renderers emit
// (`svg-ast.ts`) and maps each element 1:1 onto @react-pdf/renderer's
// <Svg> primitives. Same data → same shapes, by construction, for all 21
// kinds in `ALL_VISUAL_KINDS` (including the placeholder for org_chart /
// flow_diagram). A renderer change lands on the web and the PDF together.
//
// What differs from the browser, deliberately:
//   - <title>/<desc> are not drawable in react-pdf; the chapter prints the
//     a11y table next to the chart instead (spec §D.2 "PDF appendix prints
//     the same tables").
//   - fonts: Helvetica (built in — nothing to bundle in the standalone
//     release); glyphs outside WinAnsi are mapped by `pdf-text.ts`.
//   - the chart is scaled to the requested point width via viewBox, so a
//     320-unit chart prints at 170 mm max (print rule §D.2).

import { Circle, G, Line, Path, Polygon, Polyline, Rect, Svg, Text } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { renderVisual } from "./index";
import { pdfSafeText } from "./pdf-text";
import type { RenderOpts } from "./render-opts";
import { attrNum, parseVisualSvg, viewBoxOf, type SvgNode } from "./svg-ast";
import type { VisualSpecV2 } from "./types";

/** 170 mm in PDF points — the print rule's maximum chart width. */
export const PDF_CHART_MAX_WIDTH_PT = 482;

const PDF_FONT = "Helvetica";

type Attrs = Record<string, string | number | undefined>;

function presentation(a: Record<string, string>): Attrs {
  const out: Attrs = {};
  if (a.fill !== undefined) out.fill = a.fill;
  if (a.stroke !== undefined) out.stroke = a.stroke;
  if (a["stroke-width"] !== undefined) out.strokeWidth = attrNum(a, "stroke-width", 1);
  if (a["stroke-dasharray"] !== undefined) out.strokeDasharray = a["stroke-dasharray"];
  if (a["stroke-linecap"] !== undefined) out.strokeLinecap = a["stroke-linecap"];
  if (a["stroke-linejoin"] !== undefined) out.strokeLinejoin = a["stroke-linejoin"];
  if (a["fill-opacity"] !== undefined) out.fillOpacity = attrNum(a, "fill-opacity", 1);
  if (a["stroke-opacity"] !== undefined) out.strokeOpacity = attrNum(a, "stroke-opacity", 1);
  if (a.opacity !== undefined) out.opacity = attrNum(a, "opacity", 1);
  if (a.transform !== undefined) out.transform = a.transform;
  return out;
}

function toElement(node: SvgNode, key: string): ReactElement | null {
  const a = node.attrs;
  const p = presentation(a) as Record<string, never>;
  switch (node.tag) {
    case "rect":
      return <Rect key={key} x={attrNum(a, "x")} y={attrNum(a, "y")} width={attrNum(a, "width")} height={attrNum(a, "height")} rx={attrNum(a, "rx")} ry={attrNum(a, "ry", attrNum(a, "rx"))} {...p} />;
    case "line":
      return <Line key={key} x1={attrNum(a, "x1")} y1={attrNum(a, "y1")} x2={attrNum(a, "x2")} y2={attrNum(a, "y2")} {...p} />;
    case "circle":
      return <Circle key={key} cx={attrNum(a, "cx")} cy={attrNum(a, "cy")} r={attrNum(a, "r")} {...p} />;
    case "path":
      return <Path key={key} d={a.d ?? ""} {...p} />;
    case "polygon":
      return <Polygon key={key} points={a.points ?? ""} {...p} />;
    case "polyline":
      return <Polyline key={key} points={a.points ?? ""} {...p} />;
    case "g":
      return (
        <G key={key} {...p}>
          {node.children.map((c, i) => toElement(c, `${key}-${i}`))}
        </G>
      );
    case "text": {
      const size = attrNum(a, "font-size", 10);
      const weight = a["font-weight"] !== undefined ? attrNum(a, "font-weight", 400) : undefined;
      const anchor = a["text-anchor"] === "middle" || a["text-anchor"] === "end" ? a["text-anchor"] : "start";
      const content = pdfSafeText(node.text);
      if (!content) return null;
      // react-pdf's SVG <Text> reads font props from `props` (not `style`)
      // and inherits fill; `fontFamily` must be a registered family.
      const textProps = { ...p, fontFamily: PDF_FONT, fontSize: size, fontWeight: weight, textAnchor: anchor } as Record<string, never>;
      return (
        <Text key={key} x={attrNum(a, "x")} y={attrNum(a, "y")} {...textProps}>
          {content}
        </Text>
      );
    }
    case "title":
    case "desc":
      return null;
    default:
      return null;
  }
}

export interface VisualPdfProps {
  spec: VisualSpecV2;
  /** Target width in PDF points (defaults to the chart's own width, capped at 170 mm). */
  widthPt?: number;
  /** Override the renderer's viewBox width (e.g. a wider funnel for a full-page chart). */
  renderWidth?: number;
  hideBadge?: boolean;
  style?: Record<string, unknown>;
}

/** Deterministic geometry from the shared renderer, sized for the page. */
export function visualPdfGeometry(spec: VisualSpecV2, opts: Pick<VisualPdfProps, "widthPt" | "renderWidth" | "hideBadge"> = {}): { root: SvgNode; viewBox: string; widthPt: number; heightPt: number } {
  const override: Partial<RenderOpts> = {};
  if (opts.renderWidth) override.width = opts.renderWidth;
  if (opts.hideBadge) override.hideBadge = true;
  const svg = renderVisual(spec, override);
  const root = parseVisualSvg(svg);
  const [vx, vy, vw, vh] = viewBoxOf(root.attrs);
  const widthPt = Math.min(PDF_CHART_MAX_WIDTH_PT, Math.max(40, opts.widthPt ?? vw));
  const heightPt = Math.round((widthPt * vh) / vw * 100) / 100;
  return { root, viewBox: `${vx} ${vy} ${vw} ${vh}`, widthPt, heightPt };
}

/** One component for every `VisualSpecV2.kind` — dispatch happens in `renderVisual`. */
export function VisualPdf({ spec, widthPt, renderWidth, hideBadge, style }: VisualPdfProps) {
  const g = visualPdfGeometry(spec, { widthPt, renderWidth, hideBadge });
  return (
    <Svg viewBox={g.viewBox} width={g.widthPt} height={g.heightPt} style={style as never}>
      {g.root.children.map((c, i) => toElement(c, `${spec.id}-${i}`))}
    </Svg>
  );
}
