#!/usr/bin/env python3
"""
Prova do redigir-segredos-e2e.py. Roda antes dele no job `e2e`: se falhar, a
redacao nao roda e o upload dos artefatos fica bloqueado.

    python3 infra/scripts/redigir-segredos-e2e.test.py
"""
import base64
import importlib.util
import io
import json
import os
import re
import sys
import tempfile
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True  # sem __pycache__ solto em infra/scripts
_spec = importlib.util.spec_from_file_location(
    "redigir", Path(__file__).with_name("redigir-segredos-e2e.py")
)
redigir = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(redigir)

# Com aspas de proposito: dentro de JSON ela sai escapada, e e essa forma que
# chega no trace e nos dados do relatorio.
SENHA = 'se"nha-FAKE-4d2'
SEGREDOS = redigir.variantes(SENHA)
# Como o Playwright grava o passo: JSON.stringify do titulo `Fill "<valor>"`.
PASSO = json.dumps({"title": f"Fill \"{SENHA}\" getByTestId('login-senha')"}).encode()


def zip_com(nome: str, conteudo: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(nome, conteudo)
    return buffer.getvalue()


def relatorio_com(conteudo: bytes) -> bytes:
    """index.html no formato do Playwright 1.62: o app procura o id, e os dados
    vem num zip em base64 dentro do template."""
    return (
        b'<script>document.getElementById("playwrightReportBase64")</script>'
        b'<template id="playwrightReportBase64">data:application/zip;base64,'
        + base64.b64encode(zip_com("4ffe0edfa6bec0ffb921.json", conteudo))
        + b"</template>"
    )


def dados_do_relatorio(html: bytes) -> bytes:
    embutido = re.search(rb"base64,([^<]*)</template>", html).group(1)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(embutido))) as z:
        return z.read("4ffe0edfa6bec0ffb921.json")


def sem_senha(dados: bytes) -> bool:
    return not any(s in dados for s in SEGREDOS)


def main() -> None:
    assert not sem_senha(PASSO), "o fixture deveria conter a senha escapada"

    # O buraco de 23/09: senha no zip em base64 dentro do index.html.
    html = relatorio_com(PASSO)
    assert sem_senha(html), "base64 esconde a senha da troca crua — por isso o vazamento"
    limpo, mudou = redigir.redigir_html(html, SEGREDOS)
    assert mudou
    dados = dados_do_relatorio(limpo)
    assert sem_senha(dados) and redigir.MARCA in dados
    json.loads(dados)  # o relatorio continua legivel

    # trace.zip e error-context.md, os dois caminhos que ja existiam.
    trace, mudou = redigir.redigir_zip(zip_com("0-trace.trace", PASSO), SEGREDOS)
    assert mudou and sem_senha(zipfile.ZipFile(io.BytesIO(trace)).read("0-trace.trace"))
    texto, mudou = redigir.redigir_bytes(f'textbox "Senha": {SENHA}'.encode(), SEGREDOS)
    assert mudou and sem_senha(texto)

    # Formato mudou (upgrade do Playwright): falhar, nunca seguir calado.
    try:
        redigir.redigir_html(b'<script>"playwrightReportBase64"</script><i>novo</i>', SEGREDOS)
    except SystemExit:
        pass
    else:
        raise AssertionError("relatorio em formato desconhecido deveria abortar a redacao")

    # HTML que nao e o relatorio passa so pela troca crua.
    assert redigir.redigir_html(b"<p>nada</p>", SEGREDOS) == (b"<p>nada</p>", False)

    # Zip que nao abre nao pode ser conferido: antes passava inteiro, calado.
    aborta(lambda: redigir.redigir_zip(b"nao e zip", SEGREDOS), "zip ilegivel")
    aborta(
        lambda: redigir.redigir_html(
            b'<template id="playwrightReportBase64">data:application/zip;base64,'
            + base64.b64encode(b"nao e zip") + b"</template>",
            SEGREDOS,
        ),
        "relatorio com zip ilegivel",
    )

    # Trace e storageState sao dump de sessao (cookie, refresh_token, Bearer).
    # Somem antes do upload — inclusive sem senha nenhuma definida, que e o
    # caminho em que main() sai cedo.
    with tempfile.TemporaryDirectory() as tmp:
        raiz = Path(tmp)
        for relativo, conteudo in {
            "apps/web/e2e-results/spec-x/trace.zip": zip_com("0-trace.trace", b"{}"),
            "apps/web/e2e-report/data/4ffe0edfa6bec0ffb921.zip": zip_com("0-trace.trace", b"{}"),
            "apps/web/e2e-results/.auth/usuario.json": b'{"refresh_token":"x"}',
            "apps/web/e2e-results/spec-x/error-context.md": b"contexto",
            "apps/web/e2e-report/data/tela.png": b"png",
        }.items():
            (raiz / relativo).parent.mkdir(parents=True, exist_ok=True)
            (raiz / relativo).write_bytes(conteudo)

        anterior = os.getcwd()
        os.chdir(raiz)
        try:
            for nome in ("E2E_PASSWORD", "E2E_ADMIN_PASSWORD", "E2E_SESSAO_PASSWORD"):
                os.environ.pop(nome, None)
            assert redigir.main() == 0
        finally:
            os.chdir(anterior)

        sobrou = sorted(p.relative_to(raiz).as_posix() for p in raiz.rglob("*") if p.is_file())
        assert sobrou == [
            "apps/web/e2e-report/data/tela.png",
            "apps/web/e2e-results/spec-x/error-context.md",
        ], sobrou
        assert not (raiz / "apps/web/e2e-results/.auth").exists()

    print("redigir-segredos-e2e: ok")


def aborta(chamada, caso: str) -> None:
    try:
        chamada()
    except SystemExit as saida:
        assert saida.code not in (0, None), f"{caso}: saiu com sucesso"
    else:
        raise AssertionError(f"{caso}: deveria abortar a redacao")


if __name__ == "__main__":
    main()
