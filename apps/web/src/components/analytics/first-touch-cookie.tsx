"use client";

import { useEffect } from "react";
import {
  buildFirstTouch,
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE_SECONDS,
  serializeFirstTouch,
} from "@/lib/analytics/first-touch";

/**
 * Grava, uma única vez, de onde a pessoa veio.
 *
 * Só escreve se o cookie ainda não existe — é o que faz dele PRIMEIRO contato.
 * Quem chega por busca orgânica raramente cria conta na mesma visita; se o
 * valor fosse sobrescrito a cada visita, no dia do signup a origem seria
 * "acesso direto" e o canal que realmente trouxe a pessoa sumiria do relatório.
 *
 * Não é montado no root layout de propósito: ele envolve `/p/[slug]`, as
 * landing pages dos lojistas, e ali a origem capturada seria o tráfego DELES.
 * Monta-se onde o tráfego da Girumo entra — a landing e o /signup.
 */
export function FirstTouchCookie() {
  useEffect(() => {
    // Checagem por prefixo com delimitador: `includes("gm_ft=")` casaria também
    // com um cookie futuro chamado `algo_gm_ft`.
    const already = document.cookie
      .split("; ")
      .some((entry) => entry.startsWith(`${FIRST_TOUCH_COOKIE}=`));
    if (already) return;

    const touch = buildFirstTouch({
      url: window.location.href,
      referrer: document.referrer,
    });
    if (!touch) return;

    const value = serializeFirstTouch(touch);
    if (!value) return;

    // Lax: o cookie precisa sobreviver à chegada vinda do Google (navegação
    // top-level de outro site), e Strict o descartaria justamente nesse caso —
    // que é o caso que este componente existe para medir.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${FIRST_TOUCH_COOKIE}=${value}; path=/; max-age=${FIRST_TOUCH_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  }, []);

  return null;
}
