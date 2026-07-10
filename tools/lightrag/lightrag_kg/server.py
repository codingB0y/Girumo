from mcp.server.fastmcp import FastMCP

from . import rag as rag_mod

mcp = FastMCP("lightrag")


@mcp.tool()
async def kg_query(question: str, mode: str = "hybrid") -> str:
    """Query the HubFlow knowledge graph. mode: hybrid | local | global | naive."""
    return await rag_mod.query(question, mode=mode)


@mcp.tool()
async def kg_insert_text(text: str, source: str = "manual") -> str:
    """Insert ad-hoc text/decision into the knowledge graph."""
    await rag_mod.insert_text(text, source=source)
    return f"Inserted ({source})"


@mcp.tool()
async def kg_stats() -> dict:
    """Return entity/relation/document counts for the knowledge graph."""
    return await rag_mod.stats()


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
