"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BadgeCheck, Lightbulb, Trophy } from "lucide-react";
import { useFetch, useI18n } from "@/components/providers";
import { EmptyState, NumberTicker } from "@/components/ui/widgets";
import { Avatar, Skeleton } from "@/components/ui/primitives";
import { PageHeader, formatTenge } from "@/components/feedback-bits";
import type { FeedbackView } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Impact() {
  const { d, t, date } = useI18n();
  const { data } = useFetch<FeedbackView[]>("/api/feedback?status=done&sort=updated");
  const total = (data ?? []).reduce((s, f) => s + (f.resolution?.savings ?? 0), 0);
  return (
    <>
      <PageHeader title={d.impact.title} subtitle={d.impact.subtitle}>
        {data && (
          <div className="flex gap-8 text-right">
            <div>
              <NumberTicker value={data.length} className="font-display text-4xl font-bold" />
              <p className="text-sm text-muted">{d.impact.count}</p>
            </div>
            {total > 0 && (
              <div>
                <p className="font-display text-4xl font-bold text-accent tabular-nums">{formatTenge(total).replace(" ₸", "")}</p>
                <p className="max-w-56 text-sm text-muted">{d.impact.savingsTotal}</p>
              </div>
            )}
          </div>
        )}
      </PageHeader>
      {!data && <Skeleton className="h-64" />}
      {data?.length === 0 && <EmptyState icons={[Trophy, Lightbulb, BadgeCheck]} title={d.impact.empty} />}
      <ol className="relative space-y-6 border-l-2 border-dashed border-line pl-6 sm:ml-3 sm:pl-10">
        {data?.map((f, i) => (
          <motion.li
            key={f.id}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="relative"
          >
            <span className="absolute -left-[37px] top-6 grid size-6 place-items-center rounded-full bg-[var(--st-done)] text-white sm:-left-[53px]">
              <BadgeCheck className="size-3.5" />
            </span>
            <Link href={`/ideas/${f.id}`} className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-[var(--st-done)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{t("impact.from", { n: f.code })}</span>
                <time>{f.resolution && date(f.resolution.at)}</time>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  {/* A solved problem is crossed out; an implemented proposal is not (it was not "removed"). */}
                  <p className={cn("text-sm text-muted", f.type === "problem" && "line-through decoration-line")}>{f.title}</p>
                  <p className="mt-1.5 text-[17px] font-semibold leading-snug">{f.resolution?.text}</p>
                </div>
                {(f.resolution?.effect || f.resolution?.savings) && (
                  <div className="rounded-xl bg-[color-mix(in_oklab,var(--st-done)_12%,transparent)] px-4 py-2.5 sm:max-w-64 sm:text-right">
                    {f.resolution?.effect && <p className="font-display font-bold text-[var(--st-done)]">{f.resolution.effect}</p>}
                    {!!f.resolution?.savings && <p className="mt-0.5 text-sm font-semibold">{formatTenge(f.resolution.savings)} {d.detail.perYear.replace("₸ ", "")}</p>}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                <Avatar name={f.author?.name} color={f.author?.color} anonymous={f.anonymous} size={22} />
                {f.anonymous ? d.common.anonymous : f.author?.name}
                <span className="ml-auto">{f.votesCount} {d.common.votes}</span>
              </div>
            </Link>
          </motion.li>
        ))}
      </ol>
    </>
  );
}
