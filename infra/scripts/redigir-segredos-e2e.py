#!/usr/bin/env python3
"""
Apaga a senha do E2E dos artefatos antes de eles subirem para o CI.

Existe porque o Playwright serializa o VALOR dos campos no `error-context.md`,
no relatorio HTML e dentro do `trace.zip` — inclusive de input `type=password`,
que a aplicacao usa corretamente. Sem isto, qualquer teste autenticado que
falhasse publicaria a credencial do usuario de QA num artefato baixavel por
qualquer pessoa com leitura no repositorio, que e um privilegio menor do que
ler os segredos do Actions. Falha no CI e justamente quando ha artefato.

No relatorio HTML nem precisa falhar: o titulo de todo `fill` e
`Fill "<valor>"`, de teste que passa tambem, e os dados vao num zip em base64
DENTRO do index.html — onde troca de bytes crus nao enxerga nada. Foi por esse
buraco que as senhas sairam em todo run ate 23/09/2026.

Nao substitui rotacionar a senha se ela ja vazou: serve para o proximo run.

Prova: `python3 infra/scripts/redigir-segredos-e2e.test.py`.
"""
import base64
import io
import json
import os
import re
import sys
import zipfile
from pathlib import Path

MARCA = b"[REDACTED]"
ALVOS = [Path("apps/web/e2e-report"), Path("apps/web/e2e-results")]

# Formato do Playwright 1.62 (`_writeReportData` em playwright/lib/runner).
MARCADOR_DO_RELATORIO = b"playwrightReportBase64"
RELATORIO_EMBUTIDO = re.compile(
    rb'(<template id="playwrightReportBase64">data:application/zip;base64,)'
    rb"([A-Za-z0-9+/=\s]*)(</template>)"
)


def variantes(senha: str) -> list[bytes]:
    """A senha crua e como ela sai dentro de JSON (trace, dados do relatorio):
    aspas e barra invertida viram escape, e a troca crua deixaria passar."""
    crua = senha.encode()
    em_json = json.dumps(senha, ensure_ascii=False)[1:-1].encode()
    return [crua] if em_json == crua else [crua, em_json]


def redigir_bytes(dados: bytes, segredos: list[bytes]) -> tuple[bytes, bool]:
    mudou = False
    for segredo in segredos:
        if segredo in dados:
            dados = dados.replace(segredo, MARCA)
            mudou = True
    return dados, mudou


def redigir_zip(dados: bytes, segredos: list[bytes]) -> tuple[bytes, bool]:
    """Reescreve o zip inteiro: nao da para editar uma entrada no lugar."""
    try:
        with zipfile.ZipFile(io.BytesIO(dados)) as origem:
            itens = [(i, origem.read(i.filename)) for i in origem.infolist()]
    except zipfile.BadZipFile:
        return dados, False

    limpos, mudou = [], False
    for info, conteudo in itens:
        novo, alterou = redigir_bytes(conteudo, segredos)
        mudou = mudou or alterou
        limpos.append((info, novo))

    if not mudou:
        return dados, False

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as destino:
        for info, conteudo in limpos:
            destino.writestr(info, conteudo)
    return buffer.getvalue(), True


def redigir_html(dados: bytes, segredos: list[bytes]) -> tuple[bytes, bool]:
    """O texto cru e, no index.html do relatorio, o zip embutido em base64."""
    dados, mudou = redigir_bytes(dados, segredos)
    if MARCADOR_DO_RELATORIO not in dados:
        return dados, mudou

    achado = RELATORIO_EMBUTIDO.search(dados)
    if not achado:
        # O app do relatorio ainda procura os dados, mas nao no formato que
        # este script conhece (upgrade do Playwright?). Seguir publicaria as
        # senhas de novo, calado; sair com erro bloqueia o upload.
        raise SystemExit("relatorio do Playwright em formato desconhecido: redacao abortada")

    zip_limpo, mudou_zip = redigir_zip(base64.b64decode(achado.group(2)), segredos)
    if not mudou_zip:
        return dados, mudou
    return dados[: achado.start(2)] + base64.b64encode(zip_limpo) + dados[achado.end(2):], True


def main() -> int:
    # Sao DUAS senhas desde 25/08/2026: o usuario de QA (lojista) e o admin de
    # plataforma, que a cobertura de /admin usa. Esquecer a segunda aqui teria o
    # efeito exato que este script existe para evitar — com o agravante de que a
    # conta vazada seria a de super-admin.
    candidatas = (
        os.environ.get("E2E_PASSWORD", "").strip(),
        os.environ.get("E2E_ADMIN_PASSWORD", "").strip(),
    )
    segredos = [v for senha in candidatas if senha for v in variantes(senha)]
    if not segredos:
        # Sem senha definida nao ha o que redigir — e nao e erro: o job pode
        # ter rodado so o gate anonimo.
        print("nada a redigir: E2E_PASSWORD e E2E_ADMIN_PASSWORD vazios")
        return 0

    tocados = 0
    for raiz in ALVOS:
        if not raiz.exists():
            continue
        for caminho in raiz.rglob("*"):
            if not caminho.is_file():
                continue
            dados = caminho.read_bytes()
            if caminho.suffix == ".zip":
                novos, mudou = redigir_zip(dados, segredos)
            elif caminho.suffix == ".html":
                novos, mudou = redigir_html(dados, segredos)
            else:
                novos, mudou = redigir_bytes(dados, segredos)
            if mudou:
                caminho.write_bytes(novos)
                tocados += 1

    # Só o numero: dizer QUAL arquivo continha a senha e desenhar o mapa dela.
    print(f"arquivos redigidos: {tocados}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
