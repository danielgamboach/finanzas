/**
 * Places where a sideways drag already means something else: fields, the chart, sheets, anything marked
 * data-no-swipe and boxes that scroll sideways (chip rows). Checked from the touched element up to `stop`.
 */
const SKIP = 'input, textarea, select, [contenteditable], [data-no-swipe], .ds-chart__plot, .sheet-backdrop, [role="slider"]';

export function swipeBlocked(target: Element | null, stop?: Element | null) {
  if (!target) return true;
  if (target.closest(SKIP)) return true;
  for (let n: Element | null = target; n && n !== stop && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}
