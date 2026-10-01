// The view modal: choose the grouping and which pull requests to show. App
// owns the state and the keys; this only draws the items around the cursor.

import type { ScrollBoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef } from "react";
import { type Filters, groupLabel, type ModalItem, type View } from "./rows.ts";
import { theme } from "./theme.ts";

/**
 * Props for the view modal.
 */
export type ViewModalProps = {
  items: ModalItem[];
  cursor: number;
  view: View;
  filters: Filters;
  onPick: (index: number) => void;
};

const WIDTH = 62;

// Border and footer rows around the item list.
const CHROME = 3;

const itemId = (index: number): string => `view-item-${index}`;

const heading = (dimension: string): string => `${dimension[0]!.toUpperCase()}${dimension.slice(1)}`;

const ItemLabel = ({ item, view, filters }: { item: ModalItem; view: View; filters: Filters }) => {
  if (item.kind === "group") {
    return (
      <>
        <span fg={theme.dim}>{"Group      "}</span>
        <span fg={theme.fg}>{`‹ ${view.group} ›`}</span>
      </>
    );
  }
  if (item.kind === "sub") {
    return (
      <>
        <span fg={theme.dim}>{"Sub-group  "}</span>
        <span fg={theme.fg}>{`‹ ${view.sub ?? "none"} ›`}</span>
      </>
    );
  }
  if (item.kind === "heading") return <span fg={theme.section}>{heading(item.dimension)}</span>;

  const checked = filters[item.dimension].has(item.value);
  return (
    <>
      <span fg={checked ? theme.accent : theme.dim}>{checked ? " [x] " : " [ ] "}</span>
      <span fg={theme.fg}>{groupLabel(item.dimension, item.value)}</span>
    </>
  );
};

/**
 * A centred overlay listing the grouping and every filter value.
 *
 * @param props - The items, cursor, current view and filters, and a click handler
 * @returns The rendered modal
 */
export const ViewModal = ({ items, cursor, view, filters, onPick }: ViewModalProps) => {
  const { width, height } = useTerminalDimensions();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const modalHeight = Math.min(items.length + CHROME, height - 2);

  useEffect(() => {
    scrollRef.current?.scrollChildIntoView(itemId(cursor));
  }, [cursor]);

  return (
    <box
      position="absolute"
      left={Math.max(0, Math.floor((width - WIDTH) / 2))}
      top={Math.max(1, Math.floor((height - modalHeight) / 2))}
      width={WIDTH}
      height={modalHeight}
      zIndex={10}
      border
      borderStyle="rounded"
      borderColor={theme.borderFocus}
      backgroundColor={theme.panel}
      title="View"
    >
      <scrollbox ref={scrollRef} flexGrow={1}>
        {items.map((item, index) => (
          <box
            key={itemId(index)}
            id={itemId(index)}
            height={1}
            flexShrink={0}
            paddingX={1}
            backgroundColor={index === cursor ? theme.selected : undefined}
            onMouseDown={() => onPick(index)}
          >
            <text wrapMode="none">
              <ItemLabel item={item} view={view} filters={filters} />
            </text>
          </box>
        ))}
      </scrollbox>
      <box height={1} flexShrink={0} paddingX={1}>
        <text wrapMode="none" truncate fg={theme.dim}>
          j/k move · space toggle · ←/→ change · x clear · esc close
        </text>
      </box>
    </box>
  );
};
