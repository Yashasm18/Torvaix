/** A colour theme. Its colours are in app/themes.css under [data-theme="<id>"]. */
export interface ThemeInfo {
  id: string;
  name: string;
  /** Light themes darken the status colours (see themes.css) and use light form controls. */
  mode: "light" | "dark";
  description: string;
  /** The palette it is based on, when it isn't Torvaix's own. */
  credit?: string;
  /** Background, surface, primary and two accents, for the picker's preview. */
  swatches: string[];
}

export const THEMES: ThemeInfo[] = [
  { id: "dark", name: "Torvaix Dark", mode: "dark", description: "Deep navy with Torvaix teal.", swatches: ["#0B1020", "#111827", "#00D4AA", "#3B82F6", "#A855F7"] },
  { id: "light", name: "Torvaix Light", mode: "light", description: "Clean white with deep teal.", swatches: ["#FFFFFF", "#F7F8FA", "#007A63", "#2563EB", "#7C3AED"] },
  { id: "sakura", name: "Sakura", mode: "light", description: "Cherry-blossom pastels, in an anime style.", swatches: ["#FFF7FA", "#FFEEF4", "#C2185B", "#7C4DFF", "#0091AD"] },
  { id: "latte", name: "Catppuccin Latte", mode: "light", description: "Soft pastel light from Catppuccin.", credit: "Catppuccin", swatches: ["#EFF1F5", "#E6E9EF", "#8839EF", "#1E66F5", "#40A02B"] },
  { id: "dawn", name: "Rosé Pine Dawn", mode: "light", description: "Warm paper tones with pine and rose.", credit: "Rosé Pine", swatches: ["#FAF4ED", "#FFFAF3", "#286983", "#907AA9", "#D7827E"] },
  { id: "lotus", name: "Kanagawa Lotus", mode: "light", description: "Washi-paper yellow and indigo ink.", credit: "Kanagawa", swatches: ["#F2ECBC", "#E7DBA0", "#4D699B", "#624C83", "#6F894E"] },
  { id: "sakura-night", name: "Sakura Night", mode: "dark", description: "Blossom pink and lavender on a plum night sky, in an anime style.", swatches: ["#1A1220", "#21172A", "#FF8FBC", "#B79CFF", "#7FD6E8"] },
  { id: "tokyo-night", name: "Tokyo Night", mode: "dark", description: "Neon city lights after dark.", credit: "Tokyo Night", swatches: ["#1A1B26", "#16161E", "#7AA2F7", "#BB9AF7", "#7DCFFF"] },
  { id: "kanagawa", name: "Kanagawa Wave", mode: "dark", description: "Ink and indigo from Hokusai's Great Wave.", credit: "Kanagawa", swatches: ["#1F1F28", "#16161D", "#7E9CD8", "#957FB8", "#98BB6C"] },
  { id: "mocha", name: "Catppuccin Mocha", mode: "dark", description: "Cosy pastels on a dark base.", credit: "Catppuccin", swatches: ["#1E1E2E", "#181825", "#CBA6F7", "#89B4FA", "#A6E3A1"] },
  { id: "rose-pine", name: "Rosé Pine", mode: "dark", description: "Muted rose, gold and pine.", credit: "Rosé Pine", swatches: ["#191724", "#1F1D2E", "#EBBCBA", "#C4A7E7", "#9CCFD8"] },
  { id: "dracula", name: "Dracula", mode: "dark", description: "The classic purple and pink dark theme.", credit: "Dracula", swatches: ["#282A36", "#21222C", "#BD93F9", "#FF79C6", "#8BE9FD"] },
  { id: "nord", name: "Nord", mode: "dark", description: "Cool arctic blues.", credit: "Nord", swatches: ["#2E3440", "#3B4252", "#88C0D0", "#81A1C1", "#A3BE8C"] },
  { id: "synthwave", name: "Synthwave '84", mode: "dark", description: "Retro neon pink and cyan, like an 80s anime opening.", credit: "Synthwave '84", swatches: ["#262335", "#241B2F", "#FF7EDB", "#36F9F6", "#72F1B8"] },
  { id: "cyberpunk", name: "Cyberpunk", mode: "dark", description: "Neon pink and cyan over pure black.", swatches: ["#0A0A0A", "#121212", "#FF2BD6", "#00F0FF", "#F5FF3B"] },
  { id: "aurora", name: "Aurora", mode: "dark", description: "Northern-lights green and violet on deep teal.", swatches: ["#0C1620", "#111E2A", "#3DDC97", "#9B7BFF", "#4CC9F0"] },
  { id: "terminal", name: "Terminal", mode: "dark", description: "Green-on-black, square corners.", swatches: ["#0A0F0A", "#0D140D", "#33FF66", "#B3FF66", "#66FFCC"] },
];

export const THEME_IDS: string[] = THEMES.map((t) => t.id);

/** Chosen in the picker to follow the computer's light or dark setting. */
export const SYSTEM_THEME = "system";

/** Whether a theme (as next-themes resolves it, so never "system") has a light background. */
export function isLightTheme(id: string | undefined): boolean {
  return THEMES.find((t) => t.id === id)?.mode === "light";
}
