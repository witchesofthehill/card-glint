import type { PrintingCalibrationReport } from './printing-calibration-types.js';
import type { RenderedCardInput } from './face-layout.js';
import type { ArtPlacement } from './art-placement.js';
import type { FrameColor } from './profile.js';
import type { PrintingOverrides, PrintingSelection } from './printing-presets.js';
export const printingStyleApiVersion = 1 as const;
/** An omitted field inherits. Null retains its existing explicit-hide meaning. */
export interface PrintingLayer {
  overrides?: PrintingOverrides;
  art?: Partial<ArtPlacement>;
}
export interface PrintingFrameOption {
  id: string;
  label: string;
  selection: PrintingSelection;
}
export interface PrintingFrameCondition {
  /** Exact unordered palette. [] means colorless; defaults to the source printing palette, before recoloring. */
  colors?: readonly FrameColor[];
  colorSource?: 'printing' | 'card';
  colorCount?: readonly [number, number];
  /** Any listed type; all other condition fields must also match. */
  types?: readonly string[];
  layouts?: readonly string[];
  templates?: readonly string[];
  treatments?: readonly string[];
  rarities?: readonly string[];
  artifact?: boolean;
  land?: boolean;
  legendary?: boolean;
}
export interface PrintingFrameRule {
  id: string;
  when: PrintingFrameCondition;
  frame: string;
  /** Color/layout-specific printing deltas; never includes card contents. */
  defaults?: PrintingLayer;
}
export interface PrintingSymbolPack {
  default?: string | null;
  common?: string | null;
  uncommon?: string | null;
  rare?: string | null;
  mythic?: string | null;
  special?: string | null;
}
/** Portable presentation data. Membership, storage and revision history belong to the host. */
export interface PrintingStyle {
  version: 1;
  id: string;
  label: string;
  defaults?: PrintingLayer;
  /** Printed identity is independent of the calibration sets in frame selections. */
  collectorSetCode?: string;
  symbols?: PrintingSymbolPack;
  defaultFrame: string;
  frames: readonly PrintingFrameOption[];
  /** First match wins, in explicit author order. */
  rules?: readonly PrintingFrameRule[];
}
export interface PrintingStyleChoice extends PrintingLayer {
  /** Omitted selects by rules/default. Explicit choices never silently fall back. */
  frame?: string;
}
export interface PrintingStyleResult {
  calibration: PrintingCalibrationReport;
  face: RenderedCardInput;
  selection: PrintingSelection;
  frame: string;
  frameSource: 'default' | 'rule' | 'card' | 'face' | 'fallback';
  rule?: string;
  /** Automatic compatibility fallback and unsupported inherited fields are reported. */
  notices: readonly string[];
}
