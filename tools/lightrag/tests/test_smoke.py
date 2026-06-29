def test_imports():
    from lightrag_kg import config, index, llm, rag  # noqa: F401


def test_slugify():
    from lightrag_kg.index import slugify

    assert slugify("Hello/World Foo") == "hello-world-foo"
    assert slugify("") == "unknown"
