// Create a starter TRACKING.yaml whose example entry is commented out, so the
// new file loads as empty until a repository is added.

import { writeFile } from "node:fs/promises";

/**
 * The contents of a new tracking file.
 */
export const TEMPLATE = `# Pull requests to track, keyed by repository (owner/name).
# Only \`number\` is required: \`tracking sync\` fills in the title, status,
# review, head, base, labels and description from GitHub.
#
# acme/api:
#   - number: 123
#     notes: Optional free-form notes.
`;

/**
 * Write a new tracking file from the template, refusing to overwrite one.
 *
 * @param path - Path of the file to create
 * @returns True when the file was created, false when it already existed
 */
export const initTracking = (path: string): Promise<boolean> =>
  writeFile(path, TEMPLATE, { flag: "wx" }).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return false;
      throw error;
    },
  );
