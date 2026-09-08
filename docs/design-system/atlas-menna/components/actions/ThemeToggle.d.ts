export interface ThemeToggleProps { theme: "light" | "dark"; onChange: (t: "light" | "dark") => void }
export function ThemeToggle(props: ThemeToggleProps): JSX.Element;