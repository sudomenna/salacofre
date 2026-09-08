/** @startingPoint section="Layout" subtitle="Double-rule editorial section" viewport="700x220" */
export interface PanelProps { kicker?: string; title?: string; action?: React.ReactNode; children?: React.ReactNode; rule?: "double" | "single" | "none"; padded?: boolean; style?: React.CSSProperties }
export function Panel(props: PanelProps): JSX.Element;