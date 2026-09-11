"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedFetch } from "@/lib/supabase/client";
import { Folha } from "@/components/painel/folha";
import { useConfirmacao } from "@/components/painel/confirmacao";

type MessageTemplate = {
  id: string;
  folder_id: string;
  name: string;
  body: string;
  uses: number;
};

type Folder = {
  id: string;
  name: string;
  templates: MessageTemplate[];
};

type FolderForm = { mode: "create" } | { mode: "rename"; id: string; value: string };
type CopyForm =
  | { mode: "create"; folderId: string }
  | { mode: "edit"; id: string; folderId: string; name: string; body: string };

const inputCls =
  "w-full rounded-[10px] border border-volt-950/10 bg-poco px-3.5 py-2.5 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]";

/**
 * Biblioteca de copys, agora aba de verdade com pastas por tenant. As 5
 * categorias antigas (novidade, reposição, evento, reativação, boas-vindas)
 * viram as 5 pastas iniciais, semeadas na 1ª visita pelo segmento do tenant
 * (`lib/stores/template-folders.ts`) — dali em diante são pastas normais:
 * renomear, apagar e criar quantas quiser.
 */
export default function PainelBiblioteca() {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [folderForm, setFolderForm] = useState<FolderForm | null>(null);
  const [folderValue, setFolderValue] = useState("");
  const [folderErro, setFolderErro] = useState<string | null>(null);
  const [salvandoFolder, setSalvandoFolder] = useState(false);

  const [copyForm, setCopyForm] = useState<CopyForm | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyBody, setCopyBody] = useState("");
  const [copyErro, setCopyErro] = useState<string | null>(null);
  const [salvandoCopy, setSalvandoCopy] = useState(false);

  const [apagandoId, setApagandoId] = useState<string | null>(null);

  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();

  const carregar = useCallback(() => {
    setErro(null);
    authenticatedFetch("/api/library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar a biblioteca."))))
      .then((data: Folder[]) => setFolders(data))
      .catch(() => setErro("Não deu pra carregar a biblioteca. Tenta de novo."));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleCopy(id: string, body: string) {
    try {
      await navigator.clipboard?.writeText(body);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // clipboard indisponível — sem feedback, sem quebrar a tela
    }
  }

  function abrirNovaPasta() {
    setFolderErro(null);
    setFolderValue("");
    setFolderForm({ mode: "create" });
  }

  function abrirRenomear(folder: Folder) {
    setFolderErro(null);
    setFolderValue(folder.name);
    setFolderForm({ mode: "rename", id: folder.id, value: folder.name });
  }

  async function salvarPasta() {
    if (!folderForm) return;
    const name = folderValue.trim();
    if (!name) {
      setFolderErro("Dá um nome pra pasta.");
      return;
    }

    setSalvandoFolder(true);
    setFolderErro(null);
    try {
      const url = folderForm.mode === "create" ? "/api/library/folders" : `/api/library/folders/${folderForm.id}`;
      const method = folderForm.mode === "create" ? "POST" : "PATCH";
      const res = await authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não deu pra salvar a pasta.");
      setFolderForm(null);
      carregar();
    } catch (e) {
      setFolderErro((e as Error).message);
    } finally {
      setSalvandoFolder(false);
    }
  }

  async function apagarPasta(folder: Folder) {
    const ok = await pedirConfirmacao({
      titulo: "Apagar pasta",
      texto: `Apagar "${folder.name}" apaga junto ${folder.templates.length === 0 ? "nenhuma copy (está vazia)" : `${folder.templates.length} ${folder.templates.length === 1 ? "copy" : "copies"}`}. Essa ação não pode ser desfeita.`,
      rotulo: "Apagar pasta",
      destrutivo: true,
    });
    if (!ok) return;

    setApagandoId(folder.id);
    try {
      const res = await authenticatedFetch(`/api/library/folders/${folder.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Não deu pra apagar a pasta.");
      if (activeFolderId === folder.id) setActiveFolderId("all");
      carregar();
    } catch {
      setErro("Não deu pra apagar a pasta. Tenta de novo.");
    } finally {
      setApagandoId(null);
    }
  }

  function abrirNovaCopy(folderId: string) {
    setCopyErro(null);
    setCopyName("");
    setCopyBody("");
    setCopyForm({ mode: "create", folderId });
  }

  function abrirEditarCopy(copy: MessageTemplate) {
    setCopyErro(null);
    setCopyName(copy.name);
    setCopyBody(copy.body);
    setCopyForm({ mode: "edit", id: copy.id, folderId: copy.folder_id, name: copy.name, body: copy.body });
  }

  async function salvarCopy() {
    if (!copyForm) return;
    const name = copyName.trim();
    const body = copyBody.trim();
    if (!name || !body) {
      setCopyErro("Preenche o título e o texto da copy.");
      return;
    }

    setSalvandoCopy(true);
    setCopyErro(null);
    try {
      const url = copyForm.mode === "create" ? "/api/library/templates" : `/api/library/templates/${copyForm.id}`;
      const method = copyForm.mode === "create" ? "POST" : "PATCH";
      const payload =
        copyForm.mode === "create" ? { folder_id: copyForm.folderId, name, body } : { name, body };
      const res = await authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não deu pra salvar a copy.");
      setCopyForm(null);
      carregar();
    } catch (e) {
      setCopyErro((e as Error).message);
    } finally {
      setSalvandoCopy(false);
    }
  }

  async function apagarCopy(copy: MessageTemplate) {
    const ok = await pedirConfirmacao({
      titulo: "Apagar copy",
      texto: `Apagar "${copy.name}"? Essa ação não pode ser desfeita.`,
      rotulo: "Apagar copy",
      destrutivo: true,
    });
    if (!ok) return;

    setApagandoId(copy.id);
    try {
      const res = await authenticatedFetch(`/api/library/templates/${copy.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Não deu pra apagar a copy.");
      carregar();
    } catch {
      setErro("Não deu pra apagar a copy. Tenta de novo.");
    } finally {
      setApagandoId(null);
    }
  }

  const activeFolder = folders?.find((f) => f.id === activeFolderId) ?? null;
  const visibleCopies =
    activeFolderId === "all"
      ? (folders ?? []).flatMap((f) => f.templates.map((t) => ({ ...t, folderName: f.name })))
      : (activeFolder?.templates ?? []).map((t) => ({ ...t, folderName: undefined as string | undefined }));

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Biblioteca</h1>
        <p className="mt-1 text-[19px] text-ardosia">
          Guarde suas copies em pastas do seu jeito — ex. &quot;Lançamento Black Friday&quot;.
        </p>
      </header>

      {erro && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta">
          <span>{erro}</span>
          <button type="button" onClick={carregar} className="font-medium underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      )}

      {folders === null ? (
        <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Carregando a biblioteca">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pn-skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Pastas */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFolderId("all")}
              className={cn(
                "font-data inline-flex min-h-9 items-center rounded-full px-3.5 text-12 font-medium uppercase tracking-[0.08em] transition-colors duration-[160ms]",
                activeFolderId === "all" ? "bg-volt-950 text-paper-0" : "bg-poco text-aco hover:text-volt-950",
              )}
            >
              Todas
            </button>

            {folders.map((folder) => {
              const active = activeFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className={cn(
                    "flex items-center gap-0.5 rounded-full py-1 pl-3.5 pr-1.5 transition-colors duration-[160ms]",
                    active ? "bg-volt-950 text-paper-0" : "bg-poco text-aco hover:text-volt-950",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveFolderId(folder.id)}
                    className="font-data min-h-7 text-12 font-medium uppercase tracking-[0.08em]"
                  >
                    {folder.name}
                  </button>
                  {active && (
                    <>
                      <button
                        type="button"
                        aria-label={`Renomear pasta ${folder.name}`}
                        onClick={() => abrirRenomear(folder)}
                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Apagar pasta ${folder.name}`}
                        onClick={() => apagarPasta(folder)}
                        disabled={apagandoId === folder.id}
                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-50"
                      >
                        {apagandoId === folder.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={abrirNovaPasta}
              className="font-data inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-volt-950/20 px-3.5 text-12 font-medium uppercase tracking-[0.08em] text-aco transition-colors duration-[160ms] hover:border-cobalt-500/40 hover:text-cobalt-500"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nova pasta
            </button>
          </div>

          {/* Cards de copy */}
          {visibleCopies.length === 0 ? (
            <div className="pn-card rounded-xl px-5 py-16 text-center">
              <p className="text-[22px] text-volt-950">
                {activeFolderId === "all" ? "Nenhuma copy ainda." : "Nenhuma copy nessa pasta ainda."}
              </p>
              {activeFolder && (
                <button
                  type="button"
                  onClick={() => abrirNovaCopy(activeFolder.id)}
                  className="font-data mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cobalt-500 px-4 py-2.5 text-12 font-medium uppercase tracking-[0.08em] text-paper-0 transition hover:brightness-95"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nova copy
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleCopies.map((copy) => {
                const copied = copiedId === copy.id;
                return (
                  <div key={copy.id} className="pn-card flex flex-col rounded-xl p-5">
                    {copy.folderName && (
                      <span className="font-data mb-1.5 inline-block w-fit rounded-full bg-poco px-2 py-0.5 text-[10px] uppercase tracking-wide text-aco/70">
                        {copy.folderName}
                      </span>
                    )}
                    <p className="font-medium text-volt-950">{copy.name}</p>
                    <p className="mt-2 flex-1 whitespace-pre-line text-sm leading-relaxed text-aco">{copy.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(copy.id, copy.body)}
                        className={cn(
                          "font-data inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-12 font-medium uppercase tracking-[0.08em] transition-colors duration-[160ms]",
                          copied ? "bg-sucesso/10 text-sucesso" : "bg-poco text-aco hover:text-volt-950",
                        )}
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copiado!" : "Copiar"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Editar ${copy.name}`}
                        onClick={() => abrirEditarCopy(copy)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-aco hover:bg-poco hover:text-volt-950"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Apagar ${copy.name}`}
                        onClick={() => apagarCopy(copy)}
                        disabled={apagandoId === copy.id}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-aco hover:bg-danger-700/10 hover:text-danger-700 disabled:opacity-50"
                      >
                        {apagandoId === copy.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {activeFolder && (
                <button
                  type="button"
                  onClick={() => abrirNovaCopy(activeFolder.id)}
                  className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-volt-950/20 text-aco transition-colors duration-[160ms] hover:border-cobalt-500/40 hover:text-cobalt-500"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  <span className="font-data text-12 font-medium uppercase tracking-[0.08em]">Nova copy</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Folha
        aberta={folderForm !== null}
        aoFechar={() => setFolderForm(null)}
        titulo={folderForm?.mode === "rename" ? "Renomear pasta" : "Nova pasta"}
        testId="biblioteca-folder-folha"
        emQualquerLargura
      >
        <label className="block text-sm font-medium text-volt-950">
          Nome da pasta
          <input
            value={folderValue}
            onChange={(e) => setFolderValue(e.target.value)}
            placeholder="Ex.: Lançamento Black Friday"
            className={cn(inputCls, "mt-1.5")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && salvarPasta()}
          />
        </label>
        {folderErro && <p className="mt-2 text-sm text-alerta">{folderErro}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setFolderForm(null)}
            className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[15px] font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvarPasta}
            disabled={salvandoFolder}
            className="min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[15px] font-semibold text-paper-0 transition-[filter] hover:brightness-95 disabled:opacity-60"
          >
            {salvandoFolder ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Folha>

      <Folha
        aberta={copyForm !== null}
        aoFechar={() => setCopyForm(null)}
        titulo={copyForm?.mode === "edit" ? "Editar copy" : "Nova copy"}
        testId="biblioteca-copy-folha"
        emQualquerLargura
      >
        <label className="block text-sm font-medium text-volt-950">
          Título
          <input
            value={copyName}
            onChange={(e) => setCopyName(e.target.value)}
            placeholder="Ex.: Coleção nova chegou"
            className={cn(inputCls, "mt-1.5")}
            autoFocus
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-volt-950">
          Texto
          <textarea
            value={copyBody}
            onChange={(e) => setCopyBody(e.target.value)}
            rows={5}
            placeholder="Ex.: Chegou coleção nova na [loja]! 🔥"
            className={cn(inputCls, "mt-1.5 resize-none")}
          />
        </label>
        {copyErro && <p className="mt-2 text-sm text-alerta">{copyErro}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setCopyForm(null)}
            className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[15px] font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvarCopy}
            disabled={salvandoCopy}
            className="min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[15px] font-semibold text-paper-0 transition-[filter] hover:brightness-95 disabled:opacity-60"
          >
            {salvandoCopy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Folha>

      {folhaDeConfirmacao}
    </div>
  );
}
