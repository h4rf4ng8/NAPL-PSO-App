const BLOCKED_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'pussy', 'whore',
  'porn', 'rapist', 'dildo', 'masturbate', 'orgasm',
  'nigger', 'nigga', 'faggot', 'retard', 'wetback',
  'chink', 'kike', 'tranny', 'nazi', 'hitler', 'rapehub',
];

const BLOCKED_WHOLEWORDS = [
  'cunt', 'dick', 'cock', 'piss', 'wank', 'twat', 'prick', 'slut',
  'sex', 'rape', 'cum', 'penis', 'vagina', 'boobs', 'horny',
  'nude', 'nudes', 'fag', 'spic', 'dyke', 'coon', 'gook', 'kkk',
];

function normalizeForBlockedWords(value: string): string {
  const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
  return value.toLowerCase()
    .replaceAll(/[013457 8@$!]/g, character => leet[character] || character)
    .replaceAll(/[^a-z]/g, '')
    .replaceAll(/(.)\1{2,}/g, '$1');
}

// Returns the matching blocked word, or null when the name is allowed.
export function checkBlockedName(value: string): string | null {
  const normalized = normalizeForBlockedWords(value);
  const collapsed = normalized.replaceAll(/(.)\1+/g, '$1');

  for (const word of BLOCKED_SUBSTRINGS) {
    if (normalized.includes(word) || collapsed.includes(word)) return word;
  }
  for (const word of BLOCKED_WHOLEWORDS) {
    if (new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(value.toLowerCase())) return word;
    if (normalized === word || collapsed === word) return word;
  }
  return null;
}
