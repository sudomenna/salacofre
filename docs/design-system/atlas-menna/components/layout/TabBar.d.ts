export interface TabItem { value: string; label: string; icon?: React.ReactNode }
export interface TabBarProps { items: TabItem[]; value: string; onChange: (v: string) => void; style?: React.CSSProperties }
export function TabBar(props: TabBarProps): JSX.Element;