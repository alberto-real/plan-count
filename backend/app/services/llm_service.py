from __future__ import annotations

import base64
import json
from abc import ABC, abstractmethod

import httpx

from app.models import LegendEntry, StyleGroup


class LegendReadingService(ABC):
    """Reads a legend from a rendered image, choosing colors/linetypes/
    lineweights only from a fixed list of real candidates the caller
    already extracted deterministically — never inventing a value.
    """

    @abstractmethod
    def read_legend(self, image_png: bytes, candidates: list[StyleGroup]) -> list[LegendEntry]:
        """Return one `LegendEntry` per row the service found in the
        image. Every returned `colorHex`/`linetype`/`lineweight` is copied
        verbatim from one of `candidates` — never synthesized."""


class StubLegendReadingService(LegendReadingService):
    """Deterministic stand-in for tests / local dev without network
    access: maps every candidate 1:1, in order, to a synthetic key/label.
    """

    def read_legend(self, image_png: bytes, candidates: list[StyleGroup]) -> list[LegendEntry]:
        return [
            LegendEntry(
                key=f"C{i + 1}",
                label=f"Candidate {i + 1}",
                colorHex=candidate.colorHex,
                linetype=candidate.linetype,
                lineweight=candidate.lineweight,
            )
            for i, candidate in enumerate(candidates)
        ]


def _extract_json_array(text: str) -> list[dict]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        newline_index = text.find("\n")
        if newline_index != -1:
            text = text[newline_index + 1 :]
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON array found in legend-reading response: {text!r}")
    return json.loads(text[start : end + 1])


class OpenRouterLegendReader(LegendReadingService):
    """Real implementation: sends the legend image plus a numbered list of
    real candidate styles to a vision-capable model via OpenRouter, and
    resolves the model's chosen `candidateIndex` per row back to the exact
    candidate values.
    """

    _ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def read_legend(self, image_png: bytes, candidates: list[StyleGroup]) -> list[LegendEntry]:
        image_b64 = base64.b64encode(image_png).decode("ascii")
        prompt = self._build_prompt(candidates)

        response = httpx.post(
            self._ENDPOINT,
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={
                "model": self._model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                            },
                        ],
                    }
                ],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        rows = _extract_json_array(content)

        entries: list[LegendEntry] = []
        for row in rows:
            index = row.get("candidateIndex")
            if not isinstance(index, int) or not (0 <= index < len(candidates)):
                continue
            candidate = candidates[index]
            entries.append(
                LegendEntry(
                    key=row["key"],
                    label=row["label"],
                    colorHex=candidate.colorHex,
                    linetype=candidate.linetype,
                    lineweight=candidate.lineweight,
                )
            )
        return entries

    @staticmethod
    def _build_prompt(candidates: list[StyleGroup]) -> str:
        candidate_lines = "\n".join(
            f"{i}: color={c.colorHex} linetype={c.linetype} lineweight={c.lineweight}"
            for i, c in enumerate(candidates)
        )
        return (
            "You are reading a legend table from an architectural drawing. "
            "For every row in the legend, identify which of the numbered "
            "candidate line styles below it visually matches (by color and "
            "by whether the sample is a solid or a dashed/patterned line). "
            "Never invent a style that is not in this list — always pick "
            "one of the given indices.\n\nCandidates:\n"
            f"{candidate_lines}\n\n"
            "Respond with ONLY a JSON array, no other text, in this exact "
            'shape: [{"key": "R1", "label": "...", "candidateIndex": 0}, ...]'
        )
