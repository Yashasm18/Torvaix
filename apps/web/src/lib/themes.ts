export type Theme = 'dark' | 'light' | 'cyberpunk' | 'aurora' | 'terminal';

export const THEMES: { id: Theme; name: string; description: string }[] = [
  {
    id: 'dark',
    name: 'Torvaix Dark',
    description: 'Deep charcoal base with electric blue and violet accents.',
  },
  {
    id: 'light',
    name: 'Torvaix Light',
    description: 'A clean, refined light theme with deep contrast.',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon pink and cyan over pure black.',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights gradients with deep teal and green.',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Retro green-on-black terminal aesthetic.',
  },
];
