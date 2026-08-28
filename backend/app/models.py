from pydantic import BaseModel


class LayerResult(BaseModel):
    rawLayerName: str
    materialName: str
    linearMeters: float


class UploadResponse(BaseModel):
    layers: list[LayerResult]
    undeterminedLayers: list[str]
