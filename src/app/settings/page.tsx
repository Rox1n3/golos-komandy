"use client";

import { useState } from "react";
import { Clock, EyeOff, KeyRound, Plus, Route, Settings2, ShieldCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useFetch, useI18n } from "@/components/providers";
import { EmptyState } from "@/components/ui/widgets";
import { Button, Card, Input, Label, Select, Switch } from "@/components/ui/primitives";
import { PageHeader, statusColor } from "@/components/feedback-bits";
import { SLA_CRITICAL, SLA_HIGH, SLA_HOURS, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

type Stats = {
  byCategory: { key: string; value: number }[];
  byAssignee: { id: string; open: number }[];
};

/**
 * Administrator settings: categories with routing rules, fallback responsible, absences,
 * review deadlines and the access matrix. Every change applies to new tickets immediately.
 */
export default function SettingsPage() {
  const { d, t, locale } = useI18n();
  const { me, isAdmin, users, categories, settings, loginAs, refreshMe } = useApp();
  const { data: stats, reload } = useFetch<Stats>(isAdmin ? "/api/stats" : null);
  const [nameRu, setNameRu] = useState("");
  const [nameKk, setNameKk] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);

  if (me && !isAdmin) {
    const admin = users.find((u) => u.role === "admin");
    return (
      <EmptyState
        icons={[Settings2, ShieldCheck, KeyRound]}
        title={d.settings.noAccess}
        description={d.settings.noAccessHint}
        action={admin && <Button onClick={() => loginAs(admin.id)}>{d.settings.switch}</Button>}
        className="mt-10"
      />
    );
  }

  const owners = users.filter((u) => u.role !== "employee");
  const count = (id: string) => stats?.byCategory.find((c) => c.key === id)?.value ?? 0;
  const openOf = (id: string) => stats?.byAssignee.find((a) => a.id === id)?.open ?? 0;
  const save = async (url: string, body: unknown) => {
    try {
      await api(url, "PATCH", body);
      await refreshMe();
      reload();
      toast.success(d.settings.saved);
    } catch {
      toast.error(d.common.error);
    }
  };

  const slaRows: Status[] = ["new", "review", "needs_info", "accepted", "in_progress"];
  const slaCell = (table: Partial<Record<Status, number>>, s: Status) => (table[s] ? t("settings.hours", { n: table[s]! }) : d.settings.noClock);

  return (
    <>
      <PageHeader title={d.settings.title} subtitle={d.settings.subtitle} />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold"><Route className="size-4 text-accent" /> {d.settings.routing}</h2>
          <p className="mt-1 text-sm text-muted">{d.settings.routingHint}</p>
          {/* A list instead of a wide table: on a phone the responsible select moves to its own line. */}
          <div className="mt-4 text-sm">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,15rem)_4.5rem_3rem] gap-3 border-b border-line py-2 text-xs text-muted sm:grid">
              <span>{d.settings.colCategory}</span>
              <span>{d.settings.colResponsible}</span>
              <span className="text-right">{d.settings.colTickets}</span>
              <span className="text-right">{d.settings.colActive}</span>
            </div>
            <ul className="divide-y divide-line">
              {categories.map((c) => {
                const resp = users.find((u) => u.id === c.responsibleId);
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_4.5rem_3rem]",
                      !c.active && "opacity-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{c.name[locale] || c.name.ru}</span>
                      <span className="block text-xs text-muted sm:hidden">
                        {d.settings.colTickets}: {count(c.id)}
                      </span>
                    </span>
                    <Select
                      aria-label={`${d.settings.colResponsible}: ${c.name.ru}`}
                      value={c.responsibleId ?? ""}
                      onChange={(e) => save(`/api/categories/${c.id}`, { responsibleId: e.target.value })}
                      className={cn("col-span-2 row-start-2 h-9 sm:col-span-1 sm:row-start-auto", resp?.away && "border-sun")}
                    >
                      <option value="">{d.settings.none}</option>
                      {owners.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}{u.away ? ` (${d.analytics.awayMark})` : ""}
                        </option>
                      ))}
                    </Select>
                    <span className="hidden text-right tabular-nums text-muted sm:block">{count(c.id)}</span>
                    <span className="flex justify-end">
                      {c.id !== "other" && (
                        <Switch checked={c.active} onChange={(v) => save(`/api/categories/${c.id}`, { active: v })} label={`${d.settings.colActive}: ${c.name.ru}`} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <form
            className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (nameRu.trim().length < 2) return;
              setBusy(true);
              try {
                await api("/api/categories", "POST", { name: { ru: nameRu, kk: nameKk }, responsibleId: owner || undefined });
                await refreshMe();
                setNameRu("");
                setNameKk("");
                setOwner("");
                toast.success(d.settings.added);
              } catch {
                toast.error(d.common.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold sm:col-span-4"><Plus className="size-4" /> {d.settings.addCategory}</p>
            <div>
              <Label htmlFor="cru">{d.settings.nameRu}</Label>
              <Input id="cru" value={nameRu} maxLength={60} onChange={(e) => setNameRu(e.target.value)} className="h-10" />
            </div>
            <div>
              <Label htmlFor="ckk">{d.settings.nameKk}</Label>
              <Input id="ckk" value={nameKk} maxLength={60} onChange={(e) => setNameKk(e.target.value)} className="h-10" />
            </div>
            <div>
              <Label htmlFor="cown">{d.settings.colResponsible}</Label>
              <Select id="cown" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">{d.settings.none}</option>
                {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <Button type="submit" disabled={busy || nameRu.trim().length < 2}>{d.settings.add}</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">{d.settings.fallback}</h2>
            <p className="mt-1 text-sm text-muted">{d.settings.fallbackHint}</p>
            <Select
              aria-label={d.settings.fallback}
              className="mt-3"
              value={settings?.fallbackAssigneeId ?? ""}
              onChange={(e) => save("/api/settings", { fallbackAssigneeId: e.target.value })}
            >
              {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><UserRoundX className="size-4" /> {d.settings.people}</h2>
            <p className="mt-1 text-sm text-muted">{d.settings.peopleHint}</p>
            {/* No inner scroll area: a scrollbar on top of the switches clipped them. */}
            <ul className="mt-3 divide-y divide-line">
              {owners.filter((u) => u.role === "reviewer").map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className={cn("block text-sm", u.away && "text-muted")}>{u.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t("settings.open", { n: openOf(u.id) })}
                      {u.away && <span className="font-medium text-sun"> · {d.settings.away}</span>}
                    </span>
                  </span>
                  <Switch checked={!!u.away} onChange={(v) => save(`/api/users/${u.id}`, { away: v })} label={`${u.name}: ${d.settings.away}`} />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="min-w-0 p-5 sm:p-6 xl:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold"><Clock className="size-4" /> {d.settings.sla}</h2>
          <p className="mt-1 text-sm text-muted">{d.settings.slaHint}</p>
          <div className="scrollbar-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">{d.feed.status}</th>
                  <th className="py-2 pr-3 font-medium">{d.settings.slaNormal}</th>
                  <th className="py-2 pr-3 font-medium">{d.settings.slaHigh}</th>
                  <th className="py-2 font-medium">{d.settings.slaCritical}</th>
                </tr>
              </thead>
              <tbody>
                {slaRows.map((s) => (
                  <tr key={s} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: statusColor(s) }} /> {d.status[s]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{slaCell(SLA_HOURS, s)}</td>
                    <td className="py-2 pr-3 tabular-nums">{slaCell(SLA_HIGH, s)}</td>
                    <td className="py-2 tabular-nums">{slaCell(SLA_CRITICAL, s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="min-w-0 p-5 sm:p-6 xl:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> {d.settings.access}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted"><EyeOff className="mt-0.5 size-3.5 shrink-0" /> {d.settings.accessHint}</p>
          <div className="scrollbar-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium" />
                  {d.settings.accessCols.map((c) => <th key={c} className="py-2 pr-3 font-medium">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.settings.accessRows.map(([label, ...cells]) => (
                  <tr key={label} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{label}</td>
                    {cells.map((c, i) => (
                      <td key={i} className={cn("py-2 pr-3", c === "✓" ? "font-semibold text-ok" : c === "—" ? "text-muted" : "")}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
