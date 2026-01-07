import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0E11",
        surface: "#1E2329",
        primary: "#FCD535",
        success: "#0ECB81",
        danger: "#F6465D",
        text: {
          primary: "#EAECEF",
          secondary: "#848E9C",
          disabled: "#474D57",
        },
        border: "#2B3139",
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-roboto-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
