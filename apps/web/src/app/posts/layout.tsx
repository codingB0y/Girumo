export default function PostsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 p-6 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">HubFlow — Gerador de Posts</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Posts para Instagram · 1080×1350px · Passe o mouse e clique &ldquo;Baixar PNG&rdquo;.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
