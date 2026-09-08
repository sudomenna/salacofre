export interface PartyTagProps { sigla: string; size?: "sm" | "md"; filled?: boolean; style?: React.CSSProperties }
export function PartyTag(props: PartyTagProps): JSX.Element;
export function partyColor(sigla: string): string;