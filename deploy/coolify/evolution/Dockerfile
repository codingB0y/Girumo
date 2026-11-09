# Evolution API com UMA correção em cima da imagem oficial: o Baileys passa a
# confirmar (ack) as stanzas <status> de nível superior que o WhatsApp manda
# para algumas contas. Sem o ack o servidor fecha o stream a cada 50 min e
# segura toda a entrada até lá (WhiskeySockets/Baileys#2858,
# evolution-foundation/evolution-api#2778). Ver README.evolution.md.
#
# Construída e publicada por .github/workflows/evolution-image.yml em
# ghcr.io/codingb0y/evolution-api:<tag da base>-status-ack.
# Descarte quando uma release do Baileys trouxer WhiskeySockets/Baileys#2883:
# o patch detecta o CB:status upstream e não faz nada, então o build continua
# passando com a base nova e o retorno à imagem oficial é só trocar a linha.
ARG EVOLUTION_BASE=evoapicloud/evolution-api:v2.3.7
FROM ${EVOLUTION_BASE}
LABEL org.opencontainers.image.source="https://github.com/codingB0y/Girumo"

COPY patch-baileys-status-ack.mjs /tmp/patch-baileys-status-ack.mjs
# Falha o build (de propósito) se a versão do Baileys não for a conferida ou
# se alguma âncora não estiver exatamente onde se espera.
RUN node /tmp/patch-baileys-status-ack.mjs /evolution/node_modules/baileys \
 && node --check /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
 && rm /tmp/patch-baileys-status-ack.mjs
