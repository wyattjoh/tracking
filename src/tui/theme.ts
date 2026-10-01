// Colours for the TUI. Status colours follow GitHub's own convention.

import { parseColor, SyntaxStyle } from "@opentui/core";

/**
 * Named colours used across the interface.
 */
export const theme = {
  fg: "#c9d1d9",
  dim: "#8b949e",
  accent: "#58a6ff",
  border: "#30363d",
  borderFocus: "#58a6ff",
  selected: "#1f2a3a",
  drift: "#d29922",
  error: "#f85149",
  section: "#d2a8ff",
  repo: "#79c0ff",
} as const;

const STATUS_COLOURS: Record<string, string> = {
  draft: "#8b949e",
  open: "#3fb950",
  merged: "#a371f7",
  closed: "#f85149",
};

/**
 * Colour for a status label.
 *
 * @param status - A tracking status, possibly unknown
 * @returns A hex colour
 */
export const statusColour = (status: string | undefined): string => STATUS_COLOURS[status ?? ""] ?? theme.dim;

const REVIEW_COLOURS: Record<string, string> = {
  approved: "#3fb950",
  changes_requested: "#f85149",
  review_required: "#d29922",
};

/**
 * Colour for a review label.
 *
 * @param review - A tracking review, possibly unknown
 * @returns A hex colour
 */
export const reviewColour = (review: string): string => REVIEW_COLOURS[review] ?? theme.dim;

/**
 * Create the syntax style the markdown description renders with.
 *
 * @returns A syntax style for markdown and fenced code
 */
export const createMarkdownStyle = (): SyntaxStyle =>
  SyntaxStyle.fromStyles({
    "markup.heading": { fg: parseColor("#79c0ff"), bold: true },
    "markup.bold": { bold: true },
    "markup.strong": { bold: true },
    "markup.italic": { italic: true },
    "markup.raw.inline": { fg: parseColor("#a5d6ff") },
    "markup.link": { fg: parseColor("#58a6ff"), underline: true },
    "markup.link.url": { fg: parseColor("#58a6ff"), underline: true },
    "markup.list": { fg: parseColor("#ff7b72") },
    "markup.quote": { fg: parseColor("#8b949e"), italic: true },
    keyword: { fg: parseColor("#ff7b72") },
    string: { fg: parseColor("#a5d6ff") },
    comment: { fg: parseColor("#8b949e"), italic: true },
    function: { fg: parseColor("#d2a8ff") },
    number: { fg: parseColor("#79c0ff") },
    type: { fg: parseColor("#ffa657") },
    default: { fg: parseColor("#c9d1d9") },
  });
