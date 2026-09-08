export interface HoverRow { name: string; color: string; pct: number; proj?: number }
export interface HoverCardProps { x: number; y: number; flip?: boolean; title: string; kicker?: string; apurado?: number; rows: HoverRow[]; style?: React.CSSProperties }
export function HoverCard(props: HoverCardProps): JSX.Element;