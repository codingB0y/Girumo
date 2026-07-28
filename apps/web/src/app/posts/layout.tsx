export default function PostsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas-100 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-[var(--content-max)]">
        <header className="mb-10 border-b border-line-200 pb-8 sm:mb-12 sm:pb-10">
          <p className="font-data text-xs uppercase tracking-[0.16em] text-slate-600">Girumo · Social Studio</p>
          <h1 className="mt-3 max-w-3xl font-tech text-3xl font-bold tracking-[-0.035em] text-volt-950 sm:text-4xl">
            Peças sociais para uma operação que vende em grupos.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Escolha o formato, confira a composição e exporte a versão pronta em PNG.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
