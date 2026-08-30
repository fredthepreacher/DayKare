/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#fdfbf7",
      "foreground": "#5c3a21",
      "border": "#dfcbb8",
      "card": "#fffdf8",
      "cardForeground": "#5c3a21",
      "popover": "#fffdf8",
      "popoverForeground": "#5c3a21",
      "primary": "#ffad33",
      "primaryForeground": "#5c3300",
      "secondary": "#33cccc",
      "secondaryForeground": "#004d4d",
      "muted": "#f4ece1",
      "mutedForeground": "#725845",
      "accent": "#ff66b3",
      "accentForeground": "#660033",
      "destructive": "#d62828",
      "destructiveForeground": "#ffffff",
      "input": "#dfcbb8",
      "ring": "#33cccc",
      "chart1": "#ffad33",
      "chart2": "#33cccc",
      "chart3": "#ff66b3",
      "chart4": "#3a86ff",
      "chart5": "#06d6a0",
      "sidebar": "#f4ece1",
      "sidebarForeground": "#5c3a21",
      "sidebarBorder": "#d4c3b3",
      "sidebarPrimary": "#5c3a21",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#fffdf8",
      "sidebarAccentForeground": "#5c3a21",
      "sidebarRing": "#33cccc"
    },
    "dark": {
      "background": "#2f241e",
      "foreground": "#fff7e8",
      "border": "#765746",
      "card": "#45342a",
      "cardForeground": "#fff7e8",
      "popover": "#45342a",
      "popoverForeground": "#fff7e8",
      "primary": "#ffb84d",
      "primaryForeground": "#4a2e1b",
      "secondary": "#42d6d4",
      "secondaryForeground": "#003b3b",
      "muted": "#5e483b",
      "mutedForeground": "#e5cdb8",
      "accent": "#ff80bf",
      "accentForeground": "#4d0026",
      "destructive": "#f06a5f",
      "destructiveForeground": "#3a160f",
      "input": "#765746",
      "ring": "#8ff5f1",
      "chart1": "#ffb84d",
      "chart2": "#42d6d4",
      "chart3": "#ff80bf",
      "chart4": "#6d9dff",
      "chart5": "#51e0b4",
      "sidebar": "#3b2b24",
      "sidebarForeground": "#fff7e8",
      "sidebarBorder": "#765746",
      "sidebarPrimary": "#ffb84d",
      "sidebarPrimaryForeground": "#4a2e1b",
      "sidebarAccent": "#514037",
      "sidebarAccentForeground": "#fff7e8",
      "sidebarRing": "#8ff5f1"
    }
  },
  "fontFamily": {
    "sans": [
      "Plus Jakarta Sans",
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Fraunces",
      "Georgia",
      "serif"
    ],
    "mono": [
      "Space Mono",
      "monospace"
    ]
  },
  "radius": "1rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
