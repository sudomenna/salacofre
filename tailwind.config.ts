import type { Config } from "tailwindcss";

// Tokens espelham docs/design-system/tokens.md (fonte canônica).
// Cores partidárias seguem NYT-like (constituição § 2). Nunca cores oficiais de partido.
const config: Config = {
  content: ["./app/**/*.{ts,tsx,mdx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        xs: "12px",
        sm: "14px",
        base: "16px",
        lg: "18px",
        xl: "22px",
        "2xl": "28px",
        "3xl": "36px",
        "4xl": "48px",
      },
      colors: {
        bg: {
          DEFAULT: "#ffffff",
          muted: "#fafafa",
        },
        text: {
          DEFAULT: "#222222",
          muted: "#666666",
          faint: "#999999",
        },
        border: "#e5e5e5",
        // Partidárias NYT-like (nunca oficiais de partido).
        pt: {
          DEFAULT: "#d33732",
          band: "#f0c9c8",
        },
        pl: {
          DEFAULT: "#2a52be",
          band: "#c8d4ed",
        },
        tossup: "#d9d9d9",
        success: "#2c8e4a",
        warning: "#d97706",
        error: "#b91c1c",
        live: "#ef4444",
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "24px",
        "6": "32px",
        "8": "48px",
      },
      maxWidth: {
        container: "1280px",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
