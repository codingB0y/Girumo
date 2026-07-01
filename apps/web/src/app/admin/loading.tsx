export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-breu/[0.06]" />
        <div className="h-4 w-40 rounded-md bg-breu/[0.04]" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-breu/[0.06] bg-white shadow-sm" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        <div className="border-b border-breu/[0.06] px-5 py-4">
          <div className="h-5 w-32 rounded-md bg-breu/[0.06]" />
        </div>
        <div className="divide-y divide-breu/[0.04]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-8 w-8 rounded-lg bg-breu/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded-md bg-breu/[0.06]" />
                <div className="h-3 w-32 rounded-md bg-breu/[0.04]" />
              </div>
              <div className="h-6 w-16 rounded-full bg-breu/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
