from __future__ import annotations

import io

from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.document import Drawing


def render_preview_png(doc: Drawing, dpi: int = 150) -> bytes:
    """Render the document's modelspace to PNG bytes, for handing to a
    vision-capable LLM as the image it reads the legend from.

    No cropping is performed — the caller is expected to have uploaded a
    small, dedicated legend drawing (spec §1), so the whole modelspace
    *is* the legend.
    """
    import matplotlib

    matplotlib.use("Agg")  # headless backend — no display server in the container
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(10, 10))
    try:
        ctx = RenderContext(doc)
        backend = MatplotlibBackend(ax)
        Frontend(ctx, backend).draw_layout(doc.modelspace(), finalize=True)
        ax.axis("off")

        buffer = io.BytesIO()
        fig.savefig(buffer, format="png", dpi=dpi, bbox_inches="tight", facecolor="white")
        return buffer.getvalue()
    finally:
        plt.close(fig)
