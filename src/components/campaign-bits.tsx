"use client";

import { useI18n } from "./providers";
import type { CampaignView } from "@/lib/types";

const DAY = 86400_000;

/** Share of the campaign period already gone, for the thin time bar. */
export function timeShare(c: CampaignView) {
  const start = +new Date(c.createdAt);
  const end = +new Date(c.deadline);
  return Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, end - start)));
}

export function useDeadlineText() {
  const { t, date } = useI18n();
  return (c: CampaignView) => {
    if (!c.active) return t("campaigns.endedOn", { date: date(c.closedAt ?? c.deadline) });
    const days = Math.ceil((+new Date(c.deadline) - Date.now()) / DAY);
    return days <= 1 ? t("campaigns.lastDay") : t("campaigns.daysLeft", { n: days });
  };
}

export function AudienceText({ c }: { c: CampaignView }) {
  const { d, t } = useI18n();
  return <>{c.audience === "all" ? d.campaigns.forAll : t("campaigns.forDep", { dep: d.departments[c.audience] })}</>;
}

