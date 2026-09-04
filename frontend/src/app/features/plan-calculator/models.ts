export interface StyleGroup {
  colorHex: string;
  linetype: string;
  lineweight: number;
  linearMeters: number;
}

export interface LegendEntry {
  key: string;
  label: string;
  colorHex: string;
  linetype: string;
  lineweight: number;
}

export interface MatchedEntry {
  key: string;
  label: string;
  colorHex: string;
  linearMeters: number;
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
