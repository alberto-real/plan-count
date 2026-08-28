from app.services.llm_service import LayerNamingService, StubLayerNamingService


def test_stub_is_a_layer_naming_service():
    assert isinstance(StubLayerNamingService(), LayerNamingService)


def test_known_layer_names_are_mapped():
    service = StubLayerNamingService()
    result = service.map_layer_names(["LAY_0725_EXT"])
    assert result == {"LAY_0725_EXT": "Yellowish Green Interior"}


def test_unknown_layer_names_are_omitted_not_guessed():
    service = StubLayerNamingService()
    result = service.map_layer_names(["LAY_9999_MYSTERY"])
    assert result == {}


def test_mixed_known_and_unknown_returns_partial_map():
    service = StubLayerNamingService()
    result = service.map_layer_names(["LAY_0725_EXT", "LAY_9999_MYSTERY"])
    assert result == {"LAY_0725_EXT": "Yellowish Green Interior"}


def test_empty_input_returns_empty_map():
    service = StubLayerNamingService()
    assert service.map_layer_names([]) == {}
