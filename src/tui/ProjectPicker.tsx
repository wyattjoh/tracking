// The project picker shown when no file was given and no TRACKING.yaml sits
// at or above the working directory.

import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import type { Project } from "../projects.ts";
import { theme } from "./theme.ts";

/**
 * Props for the project picker.
 */
export type ProjectPickerProps = {
  projects: Project[];
  onPick: (project: Project) => void;
  onCancel: () => void;
};

const WIDTH = 66;

// Rows around the project list: border, padding, the gap and the footer.
const CHROME = 6;

const itemId = (index: number): string => `project-item-${index}`;

/**
 * A centred list of projects to open.
 *
 * @param props - The projects and the pick and cancel callbacks
 * @returns The rendered picker
 */
export const ProjectPicker = ({ projects, onPick, onCancel }: ProjectPickerProps) => {
  const { width, height } = useTerminalDimensions();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const [cursor, setCursor] = useState(0);
  const pickerHeight = Math.min(projects.length + CHROME, height - 2);

  useEffect(() => {
    scrollRef.current?.scrollChildIntoView(itemId(cursor));
  }, [cursor]);

  const move = (delta: number) => setCursor((current) => Math.max(0, Math.min(projects.length - 1, current + delta)));

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") return onCancel();
    if (key.name === "j" || key.name === "down") return move(1);
    if (key.name === "k" || key.name === "up") return move(-1);
    if (key.name === "g") return setCursor(key.shift ? projects.length - 1 : 0);
    if (key.name === "return" || key.name === "space") onPick(projects[cursor]!);
  });

  return (
    <box
      position="absolute"
      left={Math.max(0, Math.floor((width - WIDTH) / 2))}
      top={Math.max(1, Math.floor((height - pickerHeight) / 2))}
      width={WIDTH}
      height={pickerHeight}
      border
      borderStyle="rounded"
      borderColor={theme.borderFocus}
      backgroundColor={theme.panel}
      title="Projects"
      padding={1}
      gap={1}
    >
      <scrollbox ref={scrollRef} flexGrow={1}>
        {projects.map((project, index) => (
          <box
            key={itemId(index)}
            id={itemId(index)}
            height={1}
            flexShrink={0}
            flexDirection="row"
            gap={2}
            paddingX={1}
            backgroundColor={index === cursor ? theme.selected : undefined}
            onMouseDown={() => onPick(project)}
          >
            <text wrapMode="none" flexShrink={0} fg={theme.fg}>
              {project.slug}
            </text>
            <text wrapMode="none" truncate flexShrink={1} fg={theme.dim}>
              {project.path}
            </text>
          </box>
        ))}
      </scrollbox>
      <box height={1} flexShrink={0} paddingX={1}>
        <text wrapMode="none" truncate fg={theme.dim}>
          j/k move · enter open · q quit
        </text>
      </box>
    </box>
  );
};
