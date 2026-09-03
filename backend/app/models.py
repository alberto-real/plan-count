from pydantic import BaseModel


class StyleGroup(BaseModel):
    colorHex: str
    linetype: str
    lineweight: int
    linearMeters: float


class LegendEntry(BaseModel):
    key: str
    label: str
    colorHex: str
    linetype: str
    lineweight: int


class MatchedEntry(BaseModel):
    key: str
    label: str
    colorHex: str
    linearMeters: float


class LegendProposalResponse(BaseModel):
    entries: list[LegendEntry]


class UploadResponse(BaseModel):
    matched: list[MatchedEntry]
    undetermined: list[StyleGroup]
