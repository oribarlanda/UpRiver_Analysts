import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        hila: {
          DEFAULT: "#2563eb",
          light: "#dbeafe",
        },
        yaara: {
          DEFAULT: "#db2777",
          light: "#fce7f3",
        },
        omer: {
          DEFAULT: "#059669",
          light: "#d1fae5",
        },
      },
    },
  },
  plugins: [],
};

export default config;
