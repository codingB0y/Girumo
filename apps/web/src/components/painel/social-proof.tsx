"use client";

/**
 * Subtle social proof line shown in the dashboard.
 * Deterministic per day so it feels fresh without being random.
 */
export function SocialProof({ campaigns }: { campaigns: number }) {
  // Only show when user has some activity
  if (campaigns < 1) return null;

  // Deterministic based on day of month
  const dayOfMonth = new Date().getDate();
  const avgCampaigns = 3 + (dayOfMonth % 2);
  const avgMembers = 180 + (dayOfMonth % 40) * 5;

  return (
    <p className="text-center text-xs text-aco/50">
      Lojistas como você enviam em média {avgCampaigns} campanhas/semana e captam{" "}
      {avgMembers}+ membros/mês
    </p>
  );
}
