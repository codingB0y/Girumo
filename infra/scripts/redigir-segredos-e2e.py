#!/usr/bin/env python3
"""
Apaga a senha do E2E dos artefatos antes de eles subirem para o CI.

Existe porque o Playwright serializa o VALOR dos campos no `error-context.md`,
no relatorio HTML e dentro do `trace.zip` — inclusive de input `type=password`,
que a aplicacao usa corretamente. Sem isto, qualquer teste autenticado que
falhasse publicaria a credencial do usuario de QA num artefato baixavel por
qualquer pessoa com leitura no repositorio, que e um privilegio menor do que
ler os segredos do Actions. Falha no CI e justamente quando ha artefato.

Nao substitui rotacionar a senha se ela ja vazou: serve para o proximo run.
"""
import io
import os
import sys
import zipfile
from pathlib import Path

MARCA = b"[REDACTED]"
ALVOS = [Path("apps/web/e2e-report"), Path("apps/web/e2e-results")]


def redigir_bytes(dados: bytes, segredos: list[bytes]) -> tuple[bytes, bool]:
    mudou = False
    for segredo in segredos:
        if segredo in dados:
            dados = dados.replace(segredo, MARCA)
            mudou = True
    return dados, mudou


def redigir_zip(caminho: Path, segredos: list[bytes]) -> bool:
    """Reescreve o zip inteiro: nao da para editar uma entrada no lugar."""
    try:
        with zipfile.ZipFile(caminho) as origem:
            itens = [(i, origem.read(i.filename)) for i in origem.infolist()]
    except zipfile.BadZipFile:
        return False

    limpos, mudou = [], False
    for info, dados in itens:
        novos, alterou = redigir_bytes(dados, segredos)
        mudou = mudou or alterou
        limpos.append((info, novos))

    if not mudou:
        return False

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as destino:
        for info, dados in limpos:
            destino.writestr(info, dados)
    caminho.write_bytes(buffer.getvalue())
    return True


def main() -> int:
    segredos = [v.encode() for v in (os.environ.get("E2E_PASSWORD", "").strip(),) if v]
    if not segredos:
        # Sem senha definida nao ha o que redigir — e nao e erro: o job pode
        # ter rodado so o gate anonimo.
        print("nada a redigir: E2E_PASSWORD vazio")
        return 0

    tocados = 0
    for raiz in ALVOS:
        if not raiz.exists():
            continue
        for caminho in raiz.rglob("*"):
            if not caminho.is_file():
                continue
            if caminho.suffix == ".zip":
                if redigir_zip(caminho, segredos):
                    tocados += 1
                continue
            dados = caminho.read_bytes()
            novos, mudou = redigir_bytes(dados, segredos)
            if mudou:
                caminho.write_bytes(novos)
                tocados += 1

    # Só o numero: dizer QUAL arquivo continha a senha e desenhar o mapa dela.
    print(f"arquivos redigidos: {tocados}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
