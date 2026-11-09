/** Styles that change where text wraps inside a textarea. */
const MIRRORED = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textTransform',
  'wordSpacing',
] as const;

/**
 * How far from the top of the text, in pixels, the character at `index` sits
 * once the text wraps the way it does in `textarea`. Measured with a hidden
 * copy that has the same width and font, because a textarea does not report
 * the position of a character.
 */
export function textareaOffsetOf(
  textarea: HTMLTextAreaElement,
  index: number,
): number {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const key of MIRRORED) mirror.style[key] = style[key];
  // clientWidth leaves out the borders and any scrollbar, which is the width
  // the text wraps in.
  mirror.style.boxSizing = 'border-box';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.append(marker);
  document.body.append(mirror);
  const offset = marker.offsetTop - parseFloat(style.paddingTop || '0');
  mirror.remove();
  return offset;
}

/**
 * Brings the field into view, selects `start`..`end`, and scrolls the field's
 * own overflow so the selection sits in the middle. Selecting text does not
 * scroll a long textarea to it reliably across browsers.
 */
export function revealTextareaRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
): void {
  textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(start, end);
  if (textarea.scrollHeight <= textarea.clientHeight) return;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  const offset = textareaOffsetOf(textarea, start);
  textarea.scrollTop = Math.max(
    0,
    offset - textarea.clientHeight / 2 + lineHeight / 2,
  );
}
