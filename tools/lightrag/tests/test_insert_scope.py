"""Um insert so processa o proprio lote (mais os inserts pendentes), nao a fila inteira.

Por padrao todo `ainsert` do LightRAG processa TODO doc failed/pending/processing do
storage. Em 01/11/2026 eram 116 arquivos failed (4,5M chars): cada `rag insert` e cada
lote do indice noturno tentava reprocessar todos, gastava a cota diaria do Gemini e
nenhuma decisao nova entrava.
"""
import asyncio

from lightrag_kg import rag as rag_mod

INFLIGHT = ["processing", "failed", "pending"]

LOTE = ["doc-aaaaaaaaaaaa", "doc-bbbbbbbbbbbb"]  # ids de arquivo (index.doc_id_for)
ARQUIVO_FAILED_DE_OUTRO_LOTE = "doc-cccccccccccc"
DECISAO_FAILED = "doc-" + "d" * 32  # id que o LightRAG gera para `rag insert`
MARCADOR_DUP = "dup-" + "e" * 32


class FakeDocStatus:
    def __init__(self, ids):
        self.docs = {doc_id: {"status": "failed"} for doc_id in ids}

    async def get_docs_by_statuses(self, statuses):
        return dict(self.docs)


class FakeRag:
    """So o que o pipeline usa: `ainsert` pergunta o que esta em andamento e processa."""

    def __init__(self, ids, falha=False):
        self.doc_status = FakeDocStatus(ids)
        self.falha = falha
        self.processados = None

    async def ainsert(self, input, ids=None, file_paths=None):
        self.processados = sorted(await self.doc_status.get_docs_by_statuses(INFLIGHT))
        if self.falha:
            raise RuntimeError("429 RESOURCE_EXHAUSTED")


def _rodar(fake, coro):
    rag_mod._rag_instance = fake
    try:
        asyncio.run(coro)
    finally:
        rag_mod._rag_instance = None


def test_lote_do_indice_nao_reprocessa_arquivo_failed_de_outro_lote():
    fake = FakeRag([*LOTE, ARQUIVO_FAILED_DE_OUTRO_LOTE, DECISAO_FAILED, MARCADOR_DUP])

    _rodar(fake, rag_mod.insert_batch(["a", "b"], ids=LOTE, file_paths=["a.md", "b.md"]))

    assert fake.processados == sorted([*LOTE, DECISAO_FAILED])


def test_rag_insert_so_processa_inserts():
    nova = "doc-" + "f" * 32
    fake = FakeRag([nova, DECISAO_FAILED, ARQUIVO_FAILED_DE_OUTRO_LOTE, MARCADOR_DUP])

    _rodar(fake, rag_mod.insert_text("decisao: x", source="decisao-teste"))

    assert fake.processados == sorted([nova, DECISAO_FAILED])


def test_filtro_sai_mesmo_quando_o_insert_falha():
    fake = FakeRag([*LOTE, ARQUIVO_FAILED_DE_OUTRO_LOTE], falha=True)

    try:
        _rodar(fake, rag_mod.insert_batch(["a", "b"], ids=LOTE, file_paths=["a.md", "b.md"]))
    except RuntimeError:
        pass
    else:
        raise AssertionError("o erro do insert tem que subir")

    tudo = asyncio.run(fake.doc_status.get_docs_by_statuses(INFLIGHT))
    assert sorted(tudo) == sorted([*LOTE, ARQUIVO_FAILED_DE_OUTRO_LOTE])
