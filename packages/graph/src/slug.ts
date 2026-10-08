/**
 * The id of a graph entity, made from its name: "React 19" becomes "react-19".
 *
 * Ingestion and lookup must agree on this, so both use this one function. It keeps letters and
 * digits of every script. The earlier version kept only a-z and 0-9, so "C++" and "C#" both
 * became "c" and shared one node, and a name such as "東京" became empty and was dropped.
 * Plain ASCII names get the same id as before, so existing graphs keep working.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/#/g, '-sharp')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}-]/gu, '');
}
