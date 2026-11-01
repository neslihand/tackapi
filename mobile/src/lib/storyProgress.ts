// How much of a telling was really read (master plan M03). A telling counts as complete only when at least 75% of its
// text has passed through the screen and enough time went by with the text in view, so a fast scroll to the end is not
// reading. Listening counts by the parts the voice actually finished.
export const COMPLETE_AT = 0.75;
const SKIMMING_WORDS_PER_SECOND = 6;   // faster than anyone reads: below this much time the text was only passed over
const SPEECH_WORDS_PER_SECOND = 2.4;
const MIN_READ_MS = 5000;
const MAX_READ_MS = 120000;

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Seconds a telling takes when read aloud, for the "about N seconds" label. */
export const spokenSeconds = (text: string) => Math.round(wordCount(text) / SPEECH_WORDS_PER_SECOND);

export const minReadMs = (text: string) => Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, wordCount(text) * COMPLETE_AT / SKIMMING_WORDS_PER_SECOND * 1000));

/** The share of the text above the bottom edge of the screen. */
export function seenRatio(viewBottom: number, textTop: number, textHeight: number) {
  return textHeight <= 0 ? 0 : Math.min(1, Math.max(0, (viewBottom - textTop) / textHeight));
}

export const textInView = (viewTop: number, viewBottom: number, textTop: number, textHeight: number) => textHeight > 0 && viewBottom > textTop && viewTop < textTop + textHeight;

export const isRead = (ratio: number, activeMs: number, text: string) => ratio >= COMPLETE_AT && activeMs >= minReadMs(text);
