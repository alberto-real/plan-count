import ezdxf

from app.services.legend_service import render_preview_png


def test_render_preview_png_returns_valid_png_bytes():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_line((0, 0), (10, 10), dxfattribs={"color": 1})

    png_bytes = render_preview_png(doc)

    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")  # PNG magic bytes
    assert len(png_bytes) > 100


def test_render_preview_png_handles_empty_document():
    doc = ezdxf.new()
    png_bytes = render_preview_png(doc)
    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
