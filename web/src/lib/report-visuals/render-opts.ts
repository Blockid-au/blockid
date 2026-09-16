// Shared options every renderer takes alongside its typed data.

import type { DataState } from "./types";

export interface RenderOpts {
  id: string;
  title: string;
  description: string;
  dataState: DataState;
  /** Override the default width (px in the viewBox — charts scale via viewBox). */
  width?: number;
  hideBadge?: boolean;
}
