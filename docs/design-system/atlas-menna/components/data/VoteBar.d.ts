export interface VoteSegment { label: string; pct: number; party?: string; color?: string }
export interface VoteBarProps { segments: VoteSegment[]; height?: number; marker?: number | null; showLabels?: boolean; style?: React.CSSProperties }
export function VoteBar(props: VoteBarProps): JSX.Element;