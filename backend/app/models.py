from typing import Literal

from pydantic import BaseModel, Field


class StyleGroup(BaseModel):
    colorHex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    linetype: str
    lineweight: int
    linearMeters: float
    isDashed: bool


class LegendEntry(BaseModel):
    key: str
    label: str
    colorHex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    linetype: str
    lineweight: int
    isDashed: bool


class MatchedEntry(BaseModel):
    key: str
    label: str
    colorHex: str
    linearMeters: float
    isDashed: bool


class LegendProposalResponse(BaseModel):
    entries: list[LegendEntry]


class UploadResponse(BaseModel):
    matched: list[MatchedEntry]
    undetermined: list[StyleGroup]
    detectedUnit: Literal["mm", "cm", "m"]
