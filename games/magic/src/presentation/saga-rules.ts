import type { RenderedCardInput, RulesParagraph } from './face-layout.js';
import { specialRules } from './special-frames.js';
import { layoutRules } from './rules-layout.js';
import { SAGA_MARKER_GEOMETRY } from './saga-frame.js';

export const SAGA_RULE_BOUNDS = {
  reminder: { x: 42.3, y: 78, width: 197 },
  chapters: { x: 65.1, width: 171 },
  top: 80,
  reminderBottom: 201,
  bottom: 569,
  reverseStatsBottom: 535,
} as const;

/** Fixed reminder area and measured chapter demand. Sparse merged chapters
 * retain a little trailing breathing room; dense chapters consume the column.
 * Defaults are shared across sets, never selected from a card name or scan. */
export const SAGA_TYPOGRAPHY = {
  maximumSize: 20.7,
  padding: 24,
  equalCells: 0,
  lastLift: 0,
  bottomSpace: 0.15,
};
export function sagaRuleLayout(
  context: CanvasRenderingContext2D,
  face: RenderedCardInput,
  options = SAGA_TYPOGRAPHY,
) {
  const rows = specialRules(face);
  const opening = rows.filter((r) => !r.badges.length);
  const chapters = rows.filter((r) => r.badges.length);
  const paragraphs = (text: string, reminder = false): RulesParagraph[] => [
    {
      role: 'rules',
      runs: reminder
        ? [{ text, italic: true }]
        : text
            .split(/(\([^)]*\))/g)
            .filter(Boolean)
            .map((text) => ({ text, italic: text.startsWith('(') })),
    },
  ];
  const typography = { leading: 0.98, paragraphGap: 0.3, flavorGap: 0 };
  const top = opening.length ? SAGA_RULE_BOUNDS.reminderBottom : SAGA_RULE_BOUNDS.top,
    bottom =
      face.reverseStats && face.layout === 'transform'
        ? SAGA_RULE_BOUNDS.reverseStatsBottom
        : SAGA_RULE_BOUNDS.bottom;
  const reminder = layoutRules(
    context,
    opening.flatMap((r) => paragraphs(r.text, r.reminder)),
    { ...SAGA_RULE_BOUNDS.reminder, height: top - SAGA_RULE_BOUNDS.top },
    20.4,
    12,
    { ...typography, centerOffset: -3 },
  );
  let size = options.maximumSize;
  let result: ReturnType<typeof layoutRules>[] = [];
  let heights: number[] = [];
  for (;;) {
    const required = chapters.map((r) =>
      Math.max(
        layoutRules(
          context,
          paragraphs(r.text),
          { ...SAGA_RULE_BOUNDS.chapters, y: 0, height: 2000 },
          size,
          size,
          typography,
        ).height + options.padding,
        SAGA_MARKER_GEOMETRY.minimumRowHeight +
          Math.max(0, r.badges.length - 1) * SAGA_MARKER_GEOMETRY.gap,
      ),
    );
    const available = bottom - top;
    if (required.reduce((a, b) => a + b, 0) > available && size > 12) {
      size = Math.max(12, size - 0.25);
      continue;
    }
    if (required.reduce((a, b) => a + b, 0) > available)
      throw Error('Saga chapter text or badges do not fit the available column.');
    const extra =
      (Math.max(0, available - required.reduce((a, b) => a + b, 0)) *
        (1 - (chapters.length === 2 && chapters[0]!.badges.length > 1 ? options.bottomSpace : 0))) /
      Math.max(1, chapters.length);
    heights = required.map((h) => h + extra);
    const share = available / Math.max(1, chapters.length);
    heights = heights.map((h) => h * (1 - options.equalCells) + share * options.equalCells);
    let y = top;
    result = chapters.map((row, i) => {
      const height = heights[i]!;
      const layout = layoutRules(
        context,
        paragraphs(row.text),
        { ...SAGA_RULE_BOUNDS.chapters, y: y + 7, height: height - 14 },
        size,
        size,
        { ...typography, centerOffset: i === chapters.length - 1 ? -options.lastLift : 0 },
      );
      y += height;
      return layout;
    });
    break;
  }
  let y = top;
  return {
    reminder,
    size,
    rows: chapters.map((r, i) => {
      const row = { ...r, top: y, height: heights[i]!, layout: result[i]! };
      y += row.height;
      return row;
    }),
  };
}
