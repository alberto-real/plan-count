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
}
