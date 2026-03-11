// Unicode edge cases: wide characters, emoji, RTL, combining marks

// CJK characters (each takes 2 columns in monospace)
export const chinese = "你好世界";
export const japanese = "こんにちは世界";
export const korean = "안녕하세요 세계";

// Mixed-width in a single line
export const mixed = "Hello 你好 World 世界 Foo バー";

// Emoji (various widths)
export const singleEmoji = "👋";
export const emojiSequence = "👨‍👩‍👧‍👦"; // family: ZWJ sequence, 1 grapheme
export const flags = "🇺🇸🇬🇧🇯🇵🇩🇪🇫🇷";
export const skinTones = "👋🏻👋🏼👋🏽👋🏾👋🏿";
export const emojiInCode = `const greeting = "Hello 👋 World 🌍";`;

// Combining characters (diacritics)
export const combining = "e\u0301"; // é as e + combining acute
export const multiCombining = "a\u0308\u0304"; // ä with macron
export const zalgo = "H\u0335\u0332\u033A\u0347e\u0344\u0354\u0353l\u0336\u0330\u0347l\u0337\u0353\u0348o\u0344\u0345\u0330";

// RTL text
export const arabic = "مرحبا بالعالم";
export const hebrew = "שלום עולם";
export const bidi = "Hello مرحبا World عالم";

// Box-drawing characters (should align in monospace)
export const box = `
┌──────────┬──────────┐
│  Cell 1  │  Cell 2  │
├──────────┼──────────┤
│  Cell 3  │  Cell 4  │
└──────────┴──────────┘
`;

// Mathematical symbols
export const math = "∀x ∈ ℝ: x² ≥ 0 ∧ ∑(i=0..n) aᵢ = ∫f(x)dx ± ε";

// Null and control characters (should render as visible replacements)
export const withNull = "before\x00after";
export const withBell = "before\x07after";
export const withEscape = "before\x1Bafter";
