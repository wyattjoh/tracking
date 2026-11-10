// The interactive view: a collapsible tree of tracked PRs, grouped by a chosen
// view, beside a detail pane. It renders from the file at once and refreshes
// with live GitHub state, syncing each refresh back into the file.

import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveFetcher, LiveMap } from "../github.ts";
import { type Change, driftFields } from "../sync.ts";
import { type PrNode, prUrl, type Tracking } from "../tracking.ts";
import {
  canCollapse,
  clearFilter,
  cycleGroup,
  cycleSub,
  filterLabel,
  filterOptions,
  groupLabel,
  type ModalItem,
  modalItems,
  type Row,
  toggleFilter,
  valueLabel,
  viewLabel,
  visibleRows,
} from "./rows.ts";
import { createMarkdownStyle, labelColours, reviewColour, statusColour, theme } from "./theme.ts";
import { readViewSettings, sameSettings, type View, type ViewSettings } from "../view.ts";
import { ViewModal } from "./ViewModal.tsx";

/**
 * Props for the interactive view.
 */
export type AppProps = {
  initial: Tracking;
  fetchLive: LiveFetcher;
  sync: (tracking: Tracking, live: LiveMap) => Promise<Change[]>;
  reload: () => Promise<Tracking>;
  fetchViewer: () => Promise<string>;
  saveView: (settings: ViewSettings) => Promise<Tracking>;
};

type FetchState = { kind: "loading" } | { kind: "ready"; at: Date } | { kind: "error"; message: string };

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const rowId = (key: string): string => `row-${key}`;

// Narrowest either pane may be dragged to, in columns.
const MIN_PANE_WIDTH = 24;

const time = (date: Date): string => date.toTimeString().slice(0, 5);

const statusCounts = (prs: PrNode[], live: LiveMap | undefined): string =>
  Object.entries(
    prs.reduce<Record<string, number>>((counts, pr) => {
      const status = live?.get(pr.id)?.status ?? pr.status ?? "unknown";
      return { ...counts, [status]: (counts[status] ?? 0) + 1 };
    }, {}),
  )
    .map(([status, count]) => `${count} ${status}`)
    .join(" · ");

// Live labels carry colours; the file's are names only.
const prLabels = (pr: PrNode, live: LiveMap | undefined): { name: string; color: string | undefined }[] =>
  live?.get(pr.id)?.labels ?? pr.labels.map((name) => ({ name, color: undefined }));

// Each label as a padded chip, spaced apart.
const LabelChips = ({ pr, live }: { pr: PrNode; live: LiveMap | undefined }) =>
  prLabels(pr, live).map(({ name, color }, index) => {
    const { fg, bg } = labelColours(color);
    return (
      <Fragment key={name}>
        {index > 0 && <span>{" "}</span>}
        <span fg={fg} bg={bg}>{` ${name} `}</span>
      </Fragment>
    );
  });

type TreeRowProps = {
  row: Row;
  spaced: boolean;
  selected: boolean;
  showRepo: boolean;
  live: LiveMap | undefined;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
};

const TreeRow = ({ row, spaced, selected, showRepo, live, onSelect, onToggle }: TreeRowProps) => {
  const collapsible = canCollapse(row);
  const glyph = collapsible ? (row.collapsed ? "▸" : "▾") : "─";
  const indent = `${" ".repeat(row.depth)}${row.kind === "pr" ? row.guide : ""}`;

  const onGlyph = (event: MouseEvent) => {
    if (!collapsible) return;
    event.stopPropagation();
    onSelect(row.key);
    onToggle(row.key);
  };

  return (
    <box
      id={rowId(row.key)}
      flexDirection="row"
      height={1}
      flexShrink={0}
      marginTop={spaced ? 1 : 0}
      backgroundColor={selected ? theme.selected : undefined}
      onMouseDown={() => onSelect(row.key)}
    >
      <text wrapMode="none" fg={theme.dim} flexShrink={0} onMouseDown={onGlyph}>
        {`${indent}${glyph} `}
      </text>
      <text wrapMode="none" flexGrow={1}>
        {row.kind === "group" && (
          <>
            <span fg={row.depth === 0 ? theme.section : theme.repo}>{groupLabel(row.dimension, row.value)}</span>
            <span fg={theme.dim}>{` ${row.prs.length}`}</span>
          </>
        )}
        {row.kind === "pr" && <PrLabel pr={row.pr} onParent={row.onParent} showRepo={showRepo} live={live} />}
      </text>
    </box>
  );
};

type PrLabelProps = {
  pr: PrNode;
  onParent: number | undefined;
  showRepo: boolean;
  live: LiveMap | undefined;
};

const PrLabel = ({ pr, onParent, showRepo, live }: PrLabelProps) => {
  const state = live?.get(pr.id);
  const drift = state ? driftFields(pr, state) : [];
  const status = state?.status ?? pr.status;
  const statusLabel = state && pr.status !== state.status ? `${pr.status ?? "?"}→${state.status}` : (status ?? "?");
  const review = state ? state.review : pr.review;

  return (
    <>
      <span fg={statusColour(status)}>{`● ${statusLabel} `}</span>
      {review && <span fg={reviewColour(review)}>{`${valueLabel(review)} `}</span>}
      <a href={prUrl(pr.repo, pr.number)} fg={theme.accent}>
        {`${showRepo ? pr.repo.split("/").at(-1) : ""}#${pr.number}`}
      </a>
      <span fg={theme.fg}>{` ${state?.title ?? pr.title ?? ""}`}</span>
      {pr.owner && <span fg={theme.dim}>{` @${pr.owner}`}</span>}
      {onParent !== undefined && <span fg={theme.dim}>{` on #${onParent}`}</span>}
      {drift.length > 0 && <span fg={theme.drift}>{" ●"}</span>}
    </>
  );
};

const Field = ({ label, children }: { label: string; children: string }) => (
  <box flexDirection="column" flexShrink={0}>
    <text fg={theme.dim}>{label}</text>
    <text fg={theme.fg} wrapMode="word">
      {children}
    </text>
  </box>
);

const PrDetail = ({ pr, live }: { pr: PrNode; live: LiveMap | undefined }) => {
  const markdownStyle = useMemo(createMarkdownStyle, []);
  const state = live?.get(pr.id);
  const drift = state ? driftFields(pr, state) : [];
  const status = state?.status ?? pr.status;
  const review = state ? state.review : pr.review;
  const url = prUrl(pr.repo, pr.number);
  const head = state?.headRefName ?? pr.head ?? "?";
  const base = state?.baseRefName ?? pr.base;
  const body = state ? state.body : (pr.description ?? "");
  const author = state?.author ?? pr.owner;

  return (
    <box flexDirection="column" gap={1} paddingX={1}>
      <text fg={theme.fg} wrapMode="word" flexShrink={0}>
        <b>{state?.title ?? pr.title ?? ""}</b>
      </text>
      <text wrapMode="word" flexShrink={0}>
        <span fg={statusColour(status)}>{`● ${status ?? "?"}`}</span>
        {review && <span fg={reviewColour(review)}>{` ${valueLabel(review)}`}</span>}
        <span fg={theme.dim}>{`  ${author ? `@${author}` : "?"} · ${head}${base ? ` → ${base}` : ""}`}</span>
      </text>
      {prLabels(pr, live).length > 0 && (
        <text wrapMode="word" flexShrink={0}>
          <LabelChips pr={pr} live={live} />
        </text>
      )}
      <text wrapMode="none" flexShrink={0}>
        <a href={url} fg={theme.accent}>
          {url}
        </a>
      </text>
      {drift.length > 0 && (
        <text fg={theme.drift} wrapMode="word" flexShrink={0}>
          {`Out of date in the file: ${drift.join(", ")}. Press s to sync.`}
        </text>
      )}
      {pr.notes && <Field label="Notes">{pr.notes}</Field>}
      {pr.dependsOn.length > 0 && <Field label="Depends on">{pr.dependsOn.join(", ")}</Field>}
      {pr.linear && <Field label="Linear">{pr.linear}</Field>}
      {pr.path && <Field label="Path">{pr.path}</Field>}
      {body !== "" && <markdown content={body} syntaxStyle={markdownStyle} conceal flexShrink={0} />}
    </box>
  );
};

const GroupDetail = ({ title, prs, live }: { title: string; prs: PrNode[]; live: LiveMap | undefined }) => (
  <box flexDirection="column" gap={1} paddingX={1}>
    <text fg={theme.fg}>
      <b>{title}</b>
    </text>
    <text fg={theme.dim}>{`${prs.length} pull requests: ${statusCounts(prs, live)}`}</text>
  </box>
);

const Detail = ({ row, live }: { row: Row | undefined; live: LiveMap | undefined }) => {
  if (!row) return null;
  if (row.kind === "pr") return <PrDetail pr={row.pr} live={live} />;
  return <GroupDetail title={`${row.dimension}: ${groupLabel(row.dimension, row.value)}`} prs={row.prs} live={live} />;
};

const FetchLabel = ({ state }: { state: FetchState }) => {
  if (state.kind === "loading") return <span fg={theme.dim}>fetching live state…</span>;
  if (state.kind === "error") return <span fg={theme.error}>{`live fetch failed: ${state.message}`}</span>;
  return <span fg={theme.dim}>{`live ${time(state.at)}`}</span>;
};

/**
 * The root component of the interactive view.
 *
 * @param props - The file, live and viewer fetchers, and sync callbacks
 * @returns The rendered interface
 */
export const App = ({ initial, fetchLive, sync, reload, fetchViewer, saveView }: AppProps) => {
  const renderer = useRenderer();
  const { width } = useTerminalDimensions();
  const [tracking, setTracking] = useState(initial);
  const [live, setLive] = useState<LiveMap | undefined>(undefined);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "loading" });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saved] = useState(() => readViewSettings(initial.doc));
  const [view, setView] = useState<View>(saved.view);
  const [viewer, setViewer] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState(saved.filters);
  // The settings last written to the file, so closing the modal unchanged writes nothing.
  const savedRef = useRef(saved);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCursor, setModalCursor] = useState(0);
  // Keys can arrive before React re-renders, so the modal handlers read a ref.
  const modalCursorRef = useRef(0);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const treeRef = useRef<ScrollBoxRenderable>(null);
  const detailRef = useRef<ScrollBoxRenderable>(null);
  const [treeWidth, setTreeWidth] = useState<number | undefined>(undefined);
  const [resizing, setResizing] = useState(false);
  // Drag events can arrive before React re-renders, so handlers read a ref.
  const resizingRef = useRef(false);
  const pressedLinkRef = useRef<string | null>(null);

  const clampWidth = (columns: number) => Math.min(Math.max(columns, MIN_PANE_WIDTH), width - MIN_PANE_WIDTH);
  const paneWidth = clampWidth(treeWidth ?? Math.round(width * 0.6));
  const borderColor = resizing ? theme.borderFocus : theme.border;

  // Link clicks and border drags bubble here from both panes.
  // The panes' touching borders sit at columns paneWidth - 1 and paneWidth.
  const onBodyMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    pressedLinkRef.current = renderer.getLinkAt(event.x, event.y);
    if (event.x !== paneWidth - 1 && event.x !== paneWidth) return;
    event.stopPropagation();
    resizingRef.current = true;
    setResizing(true);
  };
  const onBodyMouseDrag = (event: MouseEvent) => {
    pressedLinkRef.current = null;
    if (resizingRef.current) setTreeWidth(clampWidth(event.x + 1));
  };
  const endResize = () => {
    resizingRef.current = false;
    setResizing(false);
  };
  const onBodyMouseUp = (event: MouseEvent) => {
    endResize();
    const url = pressedLinkRef.current;
    pressedLinkRef.current = null;
    if (event.button !== 0 || !url || renderer.getLinkAt(event.x, event.y) !== url) return;
    setMessage(renderer.copyToClipboardOSC52(url) ? "Copied URL." : "Terminal does not support copying.");
  };

  const rows = useMemo(
    () => visibleRows(tracking, live, view, filters, viewer, collapsed),
    [tracking, live, view, filters, viewer, collapsed],
  );
  const items = useMemo(() => modalItems(filterOptions(tracking, live, viewer)), [tracking, live, viewer]);
  const activeFilters = filterLabel(filters);
  const showRepo = view.group !== "repo" && view.sub !== "repo";
  const selectedIndex = Math.max(0, rows.findIndex((row) => row.key === selectedKey));
  const selected = rows[selectedIndex];

  const syncingRef = useRef(false);
  const refresh = useCallback(async (current: Tracking) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setMessage(undefined);
    setFetchState({ kind: "loading" });
    try {
      const nextLive = await fetchLive(current.prs);
      setLive(nextLive);
      try {
        await sync(current, nextLive);
        setTracking(await reload());
      } catch (error) {
        setMessage(`Sync failed: ${errorMessage(error)}`);
      }
      setFetchState({ kind: "ready", at: new Date() });
    } catch (error) {
      setFetchState({ kind: "error", message: errorMessage(error) });
    } finally {
      syncingRef.current = false;
    }
  }, [fetchLive, sync, reload]);

  useEffect(() => {
    void refresh(initial);
  }, [initial, refresh]);

  // Only orders the author grouping, so a failure just leaves it unordered.
  useEffect(() => {
    fetchViewer().then(setViewer, () => undefined);
  }, [fetchViewer]);

  useEffect(() => {
    if (!selected) return;
    treeRef.current?.scrollChildIntoView(rowId(selected.key));
    detailRef.current?.scrollTo(0);
  }, [selected?.key]);

  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const runSync = async () => {
    if (syncingRef.current) return;
    if (!live) {
      setMessage("No live state yet; wait for the fetch to finish.");
      return;
    }
    syncingRef.current = true;
    try {
      const changes = await sync(tracking, live);
      setTracking(await reload());
      setMessage(changes.length === 0 ? "File already current." : `Synced ${changes.length} pull requests into the file.`);
    } catch (error) {
      setMessage(`Sync failed: ${errorMessage(error)}`);
    } finally {
      syncingRef.current = false;
    }
  };

  // Resolve against the latest selection so repeated keys between renders all count.
  const move = (delta: number) =>
    setSelectedKey((current) => {
      const index = Math.max(0, rows.findIndex((row) => row.key === current));
      return rows[Math.min(rows.length - 1, Math.max(0, index + delta))]?.key ?? current;
    });

  const select = (index: number) => setSelectedKey(rows[index]?.key);

  const placeCursor = (index: number) => {
    modalCursorRef.current = index;
    setModalCursor(index);
  };

  // Persist the view once the modal closes, from committed state rather than
  // the key handler's closure, so changes made just before closing are kept.
  useEffect(() => {
    if (modalOpen) return;
    const settings = { view, filters };
    if (sameSettings(settings, savedRef.current)) return;
    savedRef.current = settings;
    saveView(settings).then(setTracking, (error: unknown) =>
      setMessage(`Saving the view failed: ${errorMessage(error)}`),
    );
  }, [modalOpen, view, filters, saveView]);

  // Step to the next selectable modal item, skipping headings.
  const moveCursor = (delta: number) => {
    let index = modalCursorRef.current + delta;
    while (items[index]?.kind === "heading") index += delta;
    if (items[index]) placeCursor(index);
  };

  // Space, enter and clicks: toggle a filter or advance the group or sub-group.
  const activate = (item: ModalItem | undefined, step: 1 | -1 = 1) => {
    if (item?.kind === "group") return setView((current) => cycleGroup(current, step));
    if (item?.kind === "sub") return setView((current) => cycleSub(current, step));
    if (item?.kind === "filter") setFilters((current) => toggleFilter(current, item.dimension, item.value));
  };

  const pick = (index: number) => {
    if (items[index]?.kind === "heading") return;
    placeCursor(index);
    activate(items[index]);
  };

  // Mouse capture keeps drags from the terminal, so copy finished selections over OSC 52.
  useSelectionHandler((selection) => {
    const text = selection.getSelectedText();
    if (!text) return;
    setMessage(
      renderer.copyToClipboardOSC52(text) ? `Copied ${text.length} characters.` : "Terminal does not support copying.",
    );
  });

  useKeyboard((key) => {
    if (key.name === "q") {
      renderer.destroy();
      return;
    }
    if (modalOpen) {
      const item = items[modalCursorRef.current];
      if (key.name === "escape" || key.name === "v") return setModalOpen(false);
      if (key.name === "j" || key.name === "down") return moveCursor(1);
      if (key.name === "k" || key.name === "up") return moveCursor(-1);
      if (key.name === "space" || key.name === "return") return activate(item);
      if ((key.name === "l" || key.name === "right") && item?.kind !== "filter") return activate(item, 1);
      if ((key.name === "h" || key.name === "left") && item?.kind !== "filter") return activate(item, -1);
      if (key.name === "x" && item?.kind === "filter") setFilters((current) => clearFilter(current, item.dimension));
      return;
    }

    if (key.name === "j" || key.name === "down") return move(1);
    if (key.name === "k" || key.name === "up") return move(-1);
    if (key.name === "g") return select(key.shift ? rows.length - 1 : 0);
    if (key.ctrl && key.name === "d") return detailRef.current?.scrollBy(0.5, "viewport");
    if (key.ctrl && key.name === "u") return detailRef.current?.scrollBy(-0.5, "viewport");
    if (key.name === "r") return void refresh(tracking);
    if (key.name === "s") return void runSync();
    if (key.name === "v") return setModalOpen(true);
    if (!selected) return;

    if (key.name === "space" && canCollapse(selected)) return toggle(selected.key);
    if (key.name === "l" || key.name === "right") {
      if (canCollapse(selected) && selected.collapsed) toggle(selected.key);
      return;
    }
    if (key.name === "h" || key.name === "left") {
      if (canCollapse(selected) && !selected.collapsed) return toggle(selected.key);
      if (selected.parent) setSelectedKey(selected.parent);
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} flexShrink={0} flexDirection="row" gap={2} paddingX={1}>
        <text wrapMode="none" flexShrink={0}>
          <b fg={theme.accent}>tracking</b>
        </text>
        <text wrapMode="none" flexShrink={0} fg={theme.dim} onMouseDown={() => setModalOpen(true)}>
          {`group: ${viewLabel(view)}${activeFilters ? `  filter: ${activeFilters}` : ""}`}
        </text>
        <text wrapMode="none" flexShrink={0}>
          <FetchLabel state={fetchState} />
        </text>
        <text wrapMode="none" truncate flexShrink={1} fg={theme.dim}>
          {tracking.path}
        </text>
      </box>
      <box
        flexDirection="row"
        flexGrow={1}
        onMouseDown={onBodyMouseDown}
        onMouseDrag={onBodyMouseDrag}
        onMouseDragEnd={endResize}
        onMouseUp={onBodyMouseUp}
      >
        <box width={paneWidth} border borderStyle="rounded" borderColor={borderColor} title="Pull requests">
          <scrollbox ref={treeRef} flexGrow={1}>
            {rows.map((row, index) => (
              <TreeRow
                key={row.key}
                row={row}
                spaced={row.kind === "group" && row.depth === 0 && index > 0}
                selected={row.key === selected?.key}
                showRepo={showRepo}
                live={live}
                onSelect={setSelectedKey}
                onToggle={toggle}
              />
            ))}
          </scrollbox>
        </box>
        <box flexGrow={1} border borderStyle="rounded" borderColor={borderColor} title="Details">
          <scrollbox ref={detailRef} flexGrow={1}>
            <Detail row={selected} live={live} />
          </scrollbox>
        </box>
      </box>
      <box height={1} flexShrink={0} paddingX={1}>
        <text wrapMode="none" truncate fg={theme.dim}>
          {message ?? "j/k move · h/l collapse · space toggle · v view · ctrl-d/u scroll · drag border resize · r refresh · s sync · q quit"}
        </text>
      </box>
      {modalOpen && <ViewModal items={items} cursor={modalCursor} view={view} filters={filters} onPick={pick} onClose={() => setModalOpen(false)} />}
    </box>
  );
};
