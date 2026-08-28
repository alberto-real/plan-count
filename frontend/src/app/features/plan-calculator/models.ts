export interface LayerResult {
  rawLayerName: string;
  materialName: string;
  linearMeters: number;
}

export interface UploadResponse {
  layers: LayerResult[];
  undeterminedLayers: string[];
}
