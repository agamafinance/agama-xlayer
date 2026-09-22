import type {Config} from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {DEFAULT: "#254839", deep: "#1e3c2f", night: "#18322a"},
        card: {DEFAULT: "#2e4a3c", 2: "#37574a", 3: "#416253"},
        line: "#6e8c7d",
        mint: {DEFAULT: "#9fd9b8", soft: "rgba(159,217,184,0.14)"},
        mute: "#c2d6cb",
        dim: "#93ae9f",
        sand: "#ecc978",
        coral: "#f4a08c",
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', "Helvetica", "Arial", "system-ui", "sans-serif"],
      },
      borderWidth: {
        1.5: "1.5px",
      },
      borderRadius: {
        panel: "18px",
        box: "12px",
      },
      fontSize: {
        "2xs": ["11px", "15px"],
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
        md: ["16px", "22px"],
        lg: ["20px", "26px"],
        xl: ["26px", "30px"],
        "2xl": ["34px", "38px"],
      },
    },
  },
  plugins: [],
};

export default config;
