/**
 * Emoticon auto-replace map — longest match first to avoid partial replacements.
 */
const EMOTICON_MAP: [string, string][] = [
  [":))", "😂"],
  [":((",  "😭"],
  ["XD",  "🤣"],
  ["xD",  "🤣"],
  ["<3",  "❤️"],
  [":D",  "😁"],
  [";)",  "😉"],
  [":P",  "😛"],
  [":p",  "😛"],
  [":O",  "😮"],
  [":o",  "😮"],
  [":/",  "😕"],
  [":(",  "😢"],
  [":)",  "😊"],
  ["B)",  "😎"],
  [":*",  "😘"],
  ["O:)", "😇"],
  [">:(", "😠"],
];

export function replaceEmoticons(text: string): string {
  let result = text;
  for (const [emoticon, emoji] of EMOTICON_MAP) {
    const escaped = emoticon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-zA-Z0-9/])${escaped}(?![a-zA-Z0-9])`, "g");
    result = result.replace(regex, emoji);
  }
  return result;
}
