import httpx
import pytest

from app.models import StyleGroup
from app.services.llm_service import LegendReadingService, OpenRouterLegendReader, StubLegendReadingService


def test_stub_is_a_legend_reading_service():
    assert isinstance(StubLegendReadingService(), LegendReadingService)


def test_stub_maps_every_candidate_in_order():
    service = StubLegendReadingService()
    candidates = [
        StyleGroup(colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25, linearMeters=10.0),
        StyleGroup(colorHex="#00ff00", linetype="DASHED2", lineweight=25, linearMeters=5.0),
    ]
    entries = service.read_legend(b"fake-png-bytes", candidates)
    assert [e.key for e in entries] == ["C1", "C2"]
    assert entries[0].colorHex == "#ff0000"
    assert entries[1].linetype == "DASHED2"


def test_openrouter_reader_parses_well_formed_json_response(monkeypatch):
    candidates = [StyleGroup(colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25, linearMeters=10.0)]

    def _fake_post(url, headers=None, json=None, timeout=None):
        class _Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '[{"key": "R1", "label": "Wall A", "candidateIndex": 0}]'
                            }
                        }
                    ]
                }

        return _Response()

    monkeypatch.setattr(httpx, "post", _fake_post)
    reader = OpenRouterLegendReader(api_key="test-key", model="test-model")
    entries = reader.read_legend(b"fake-png-bytes", candidates)

    assert len(entries) == 1
    assert entries[0].key == "R1"
    assert entries[0].label == "Wall A"
    assert entries[0].colorHex == "#ff0000"
    assert entries[0].linetype == "CONTINUOUS"
    assert entries[0].lineweight == 25


def test_openrouter_reader_strips_markdown_code_fence(monkeypatch):
    candidates = [StyleGroup(colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25, linearMeters=10.0)]

    def _fake_post(url, headers=None, json=None, timeout=None):
        class _Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '```json\n[{"key": "R1", "label": "Wall A", "candidateIndex": 0}]\n```'
                            }
                        }
                    ]
                }

        return _Response()

    monkeypatch.setattr(httpx, "post", _fake_post)
    reader = OpenRouterLegendReader(api_key="test-key", model="test-model")
    entries = reader.read_legend(b"fake-png-bytes", candidates)
    assert entries[0].key == "R1"


def test_openrouter_reader_skips_out_of_range_candidate_index(monkeypatch):
    candidates = [StyleGroup(colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25, linearMeters=10.0)]

    def _fake_post(url, headers=None, json=None, timeout=None):
        class _Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '[{"key": "R1", "label": "Wall A", "candidateIndex": 5}]'
                            }
                        }
                    ]
                }

        return _Response()

    monkeypatch.setattr(httpx, "post", _fake_post)
    reader = OpenRouterLegendReader(api_key="test-key", model="test-model")
    entries = reader.read_legend(b"fake-png-bytes", candidates)
    assert entries == []


def test_openrouter_reader_raises_on_http_error(monkeypatch):
    candidates = [StyleGroup(colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25, linearMeters=10.0)]

    def _fake_post(url, headers=None, json=None, timeout=None):
        raise httpx.HTTPError("network down")

    monkeypatch.setattr(httpx, "post", _fake_post)
    reader = OpenRouterLegendReader(api_key="test-key", model="test-model")
    with pytest.raises(httpx.HTTPError):
        reader.read_legend(b"fake-png-bytes", candidates)
