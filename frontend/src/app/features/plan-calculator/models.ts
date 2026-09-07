export interface StyleGroup {
  colorHex: string;
  linetype: string;
  lineweight: number;
  linearMeters: number;
  isDashed: boolean;
}

export interface LegendEntry {
  key: string;
  label: string;
  colorHex: string;
  linetype: string;
  lineweight: number;
  isDashed: boolean;
}

export interface MatchedEntry {
  key: string;
  label: string;
  colorHex: string;
  linearMeters: number;
  isDashed: boolean;
}

export interface LegendProposalResponse {
  entries: LegendEntry[];
}

export interface UploadResponse {
  matched: MatchedEntry[];
  undetermined: StyleGroup[];
  detectedUnit: Unit;
}

export type Unit = 'mm' | 'cm' | 'm';

/** Factor to convert a raw DXF-native length into real meters. */
export const UNIT_TO_METERS: Record<Unit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
};

/** A solid fill for a continuous linetype, or a diagonal striped pattern
 * emulating a dashed line for anything else — so a legend/style swatch
 * visually matches how the material renders on the plan. */
export function swatchStyle(entity: { colorHex: string; isDashed: boolean }): Record<string, string> {
  if (!entity.isDashed) {
    return { 'background-color': entity.colorHex };
  }
  return {
    'background-image': `repeating-linear-gradient(45deg, ${entity.colorHex} 0, ${entity.colorHex} 4px, transparent 4px, transparent 8px)`,
  };
}
