from lightrag_kg.index import slugify, doc_id_for


def test_slugify_basic():
    assert slugify("apps/web/src/App.tsx") == "apps-web-src-apptsx"


def test_slugify_empty():
    assert slugify("") == "unknown"


def test_doc_id_deterministic():
    assert doc_id_for("apps/web/src/App.tsx") == doc_id_for("apps/web/src/App.tsx")
