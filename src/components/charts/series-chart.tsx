"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  /** Kurze Beschriftung der x-Achse, z. B. „16.11.“. */
  label: string;
  /** Hauptwert (Linie oder Balken); `null` lässt eine Lücke. */
  value: number | null;
  /** Optionaler Einzelmesswert, als Punkte hinter der Linie gezeichnet. */
  raw?: number | null;
}

interface SeriesChartProps {
  data: SeriesPoint[];
  kind: "line" | "bar";
  /** Beschreibung für Screenreader. */
  ariaLabel: string;
  /** Name des Hauptwerts für Tooltip, Legende und Tabelle. */
  valueLabel: string;
  /** Name der Einzelmesswerte; nur nötig, wenn `raw` gesetzt ist. */
  rawLabel?: string;
  unit: string;
  height?: number;
  /** Breite der y-Achse; größer wählen, wenn die Werte fünf Stellen haben (z. B. Schritte). */
  axisWidth?: number;
}

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const numberFormat = new Intl.NumberFormat("de", { maximumFractionDigits: 1 });
const format = (value: number | null | undefined) => (value === null || value === undefined ? "–" : numberFormat.format(value));

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string | null;
}

function ChartTooltip({
  active,
  label,
  payload,
  names,
  unit,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  names: Record<string, string>;
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="tabular-nums">
          {names[String(entry.dataKey)]}
          {": "}
          <span className="font-medium">
            {format(typeof entry.value === "number" ? entry.value : null)} {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Linien- oder Balkendiagramm mit einer Achse, Tooltip und einer Tabelle für Screenreader.
 * Farben kommen aus den geprüften Diagramm-Tokens; Texte tragen Textfarben, nie die Serienfarbe.
 */
export function SeriesChart({
  data,
  kind,
  ariaLabel,
  valueLabel,
  rawLabel,
  unit,
  height = 220,
  axisWidth = 40,
}: SeriesChartProps) {
  const hasRaw = rawLabel !== undefined;
  const names: Record<string, string> = { value: valueLabel, raw: rawLabel ?? "" };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={28} />
      <YAxis
        width={axisWidth}
        tickLine={false}
        axisLine={false}
        tick={AXIS_TICK}
        domain={kind === "bar" ? [0, "auto"] : ["auto", "auto"]}
        tickFormatter={(value: number) => numberFormat.format(value)}
      />
      <Tooltip
        cursor={kind === "bar" ? { fill: "var(--accent)" } : { stroke: "var(--muted-foreground)", strokeWidth: 1 }}
        content={<ChartTooltip names={names} unit={unit} />}
      />
    </>
  );
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };

  return (
    <figure className="grid gap-2">
      <div role="img" aria-label={ariaLabel} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data} margin={margin}>
              {axes}
              <Bar dataKey="value" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={margin}>
              {axes}
              {hasRaw ? (
                <Line
                  dataKey="raw"
                  stroke="none"
                  dot={{ r: 3, fill: "var(--viz-neutral)", stroke: "var(--card)", strokeWidth: 1 }}
                  activeDot={{ r: 4, fill: "var(--viz-neutral)" }}
                  isAnimationActive={false}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--viz-1)"
                strokeWidth={2}
                dot={data.length <= 12 && !hasRaw ? { r: 3, fill: "var(--viz-1)", strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: "var(--viz-1)", stroke: "var(--card)", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {hasRaw ? (
        <figcaption className="text-muted-foreground flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: "var(--viz-1)" }} />
            {valueLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: "var(--viz-neutral)" }} />
            {rawLabel}
          </span>
        </figcaption>
      ) : null}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((point, index) => (
            <tr key={`${point.label}-${index}`}>
              <th scope="row">{point.label}</th>
              <td>{`${valueLabel}: ${format(point.value)} ${unit}`}</td>
              {hasRaw ? <td>{`${rawLabel}: ${format(point.raw)} ${unit}`}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
