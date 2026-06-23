type Coll<T> = {
  list(): Promise<T[]>;
  create(i: Omit<T, "id">): Promise<T>;
  remove(id: string): Promise<void>;
};

type Validate<T> = (body: Record<string, unknown>) => Omit<T, "id"> | { error: string };

// Gera handlers GET (list) / POST (create) / DELETE (?id=) para uma coleção JSON.
export function crudRoute<T extends { id: string }>(coll: Coll<T>, validate: Validate<T>) {
  return {
    async GET() {
      return Response.json(await coll.list());
    },
    async POST(req: Request) {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
      }
      const v = validate(body);
      if ("error" in v) return Response.json(v, { status: 400 });
      return Response.json(await coll.create(v), { status: 201 });
    },
    async DELETE(req: Request) {
      const id = new URL(req.url).searchParams.get("id");
      if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
      await coll.remove(id);
      return Response.json({ ok: true });
    },
  };
}
