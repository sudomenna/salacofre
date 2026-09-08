/** @startingPoint section="Actions" subtitle="Ink-filled, hairline and ghost buttons" viewport="700x180" */
export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "accent";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  full?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;