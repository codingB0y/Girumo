export default function PostsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-2xl font-bold text-white">HubFlow — Gerador de Posts</h1>
        <p className="mb-8 text-sm text-neutral-400">
          Clique com botão direito → &ldquo;Salvar imagem&rdquo; ou use screenshot (cada card = 1080×1080px).
        </p>
        {children}
      </div>
    </div>
  );
}
