import { DEMO_CAMPAIGN_NAME, DEMO_GROUPS } from "@/lib/demo/fixtures";

/**
 * Tela 1 do modo demonstração: a campanha pronta pra disparar.
 *
 * Estática — sem timer, sem estado. Mostra os grupos escolhidos e o quanto
 * cada um já está cheio, exatamente como o lojista veria antes de clicar em
 * "Disparar campanha".
 */
export function CampaignStep() {
  return (
    <div data-testid="demo-campaign-step" className="space-y-4">
      <div>
        <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">Campanha</p>
        <p className="text-sm font-medium text-volt-950" data-testid="demo-campaign-name">
          {DEMO_CAMPAIGN_NAME}
        </p>
      </div>

      <ul className="divide-y divide-dashed divide-volt-950/[0.09] rounded-2xl border border-volt-950/10 bg-papel">
        {DEMO_GROUPS.map((group) => {
          const fillPct = Math.round((group.members / group.capacity) * 100);
          return (
            <li key={group.name} data-testid="demo-campaign-group" className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate text-sm text-volt-950">{group.name}</span>
              <span className="font-data shrink-0 text-xs tabular-nums text-aco/60">
                {group.members}/{group.capacity} ({fillPct}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
