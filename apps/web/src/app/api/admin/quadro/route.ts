import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { BOARD_STATUSES, type BoardPriority, type BoardStatus } from "@/lib/quadro/status";
import {
  createFeature,
  DuplicateFeatureKeyError,
  loadQuadro,
  moveCard,
  updateFeature,
} from "@/lib/stores/quadro";

export const dynamic = "force-dynamic";

/** GET — snapshot do quadro (cards + últimos 30 eventos). Alimenta o polling. */
export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await loadQuadro();
    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PRIORITIES: readonly BoardPriority[] = ["alta", "media", "baixa"];

/**
 * PATCH — move o card ou edita seus campos.
 * Body: { key, status?, note?, ref?, summary?, blocker?, priority?, sortOrder? }
 * Mover exige `note`: o motivo é o que dá valor ao feed.
 */
export async function PATCH(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    key?: string;
    status?: string;
    note?: string;
    ref?: string | null;
    summary?: string | null;
    blocker?: string | null;
    priority?: string;
    sortOrder?: number;
  };

  if (!body.key) return NextResponse.json({ error: "key obrigatória" }, { status: 400 });

  // Toda validação de input roda antes de qualquer efeito colateral (moveCard/updateFeature).
  if (body.status !== undefined) {
    if (!BOARD_STATUSES.includes(body.status as BoardStatus)) {
      return NextResponse.json({ error: `status inválido: ${body.status}` }, { status: 400 });
    }
    if (!body.note?.trim()) {
      return NextResponse.json({ error: "mover exige motivo" }, { status: 400 });
    }
  }

  if (body.priority !== undefined && !PRIORITIES.includes(body.priority as BoardPriority)) {
    return NextResponse.json({ error: `prioridade inválida: ${body.priority}` }, { status: 400 });
  }

  try {
    if (body.status !== undefined) {
      await moveCard({
        key: body.key,
        status: body.status as BoardStatus,
        note: body.note as string,
        ref: body.ref ?? null,
      });
    }

    await updateFeature(body.key, {
      summary: body.summary,
      blocker: body.blocker,
      priority: body.priority as BoardPriority | undefined,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — cria card novo, sempre em 'nao_existe'. Body: { key, title, area, summary?, priority? } */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    key?: string;
    title?: string;
    area?: string;
    summary?: string | null;
    priority?: string;
  };

  if (!body.key || !body.title || !body.area) {
    return NextResponse.json({ error: "key, title e area são obrigatórios" }, { status: 400 });
  }

  try {
    await createFeature({
      key: body.key,
      title: body.title,
      area: body.area,
      summary: body.summary ?? null,
      priority: (body.priority as BoardPriority | undefined) ?? "media",
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof DuplicateFeatureKeyError) {
      return NextResponse.json({ error: "já existe card com essa key" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
