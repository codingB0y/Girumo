import json

from mcp.server.fastmcp import FastMCP

from . import rag as rag_mod

mcp = FastMCP("lightrag")


@mcp.tool()
async def kg_query(question: str, mode: str = "hybrid") -> str:
    """Consulta o grafo de conhecimento do repositório (modes: hybrid, local, global, naive)."""
    return await rag_mod.query(question, mode=mode)


@mcp.tool()
async def kg_insert_text(text: str, source: str = "manual") -> str:
    """Insere um texto/decisão ad-hoc no grafo de conhecimento."""
    await rag_mod.insert_text(text, source=source)
    return "ok"


@mcp.tool()
async def kg_stats() -> str:
    """Retorna estatísticas do grafo (entidades, relações)."""
    return json.dumps(await rag_mod.stats())


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
