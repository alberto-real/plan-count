from abc import ABC, abstractmethod


class LayerNamingService(ABC):
    """Maps raw CAD layer names to human-readable material names.

    Implementations perform semantic interpretation only — they must
    never compute lengths, areas, or any other measurement. A layer
    name the implementation cannot confidently resolve MUST simply be
    omitted from the returned dict rather than guessed at; callers
    treat any omitted name as undetermined and fall back to the raw
    name themselves.
    """

    @abstractmethod
    def map_layer_names(self, raw_names: list[str]) -> dict[str, str]:
        """Return a partial mapping of ``{raw_name: material_name}``.

        Only names this implementation can confidently resolve appear
        as keys in the result. The result may be empty.
        """


class StubLayerNamingService(LayerNamingService):
    """Deterministic stand-in for the future OpenRouter/Gemini-backed
    service.

    Recognizes a small hardcoded table of layer names so callers and
    tests can exercise both the "determined" and "undetermined" paths
    without any network access. A real implementation can replace this
    one later without any change to code that consumes
    `LayerNamingService` — only the class instantiated in
    `api/endpoints.py` changes.
    """

    _KNOWN_MATERIALS: dict[str, str] = {
        "LAY_0725_EXT": "Yellowish Green Interior",
        "WALL_YEL_0923": "Yellow Wall Paint",
    }

    def map_layer_names(self, raw_names: list[str]) -> dict[str, str]:
        return {
            name: self._KNOWN_MATERIALS[name]
            for name in raw_names
            if name in self._KNOWN_MATERIALS
        }
