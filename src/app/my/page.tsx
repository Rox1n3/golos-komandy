"use client";

import Link from "next/link";
import { ClipboardList, Lightbulb, PenLine } from "lucide-react";
import { useApp, useFetch, useI18n } from "@/components/providers";
import { EmptyState } from "@/components/ui/widgets";
import { Skeleton, buttonVariants } from "@/components/ui/primitives";
import { FeedbackCard, PageHeader } from "@/components/feedback-bits";
import type { FeedbackView } from "@/lib/types";

export default function My() {
  const { d } = useI18n();
  const { me } = useApp();
  const { data, setData } = useFetch<FeedbackView[]>(me ? `/api/feedback?mine=1&sort=updated&u=${me.id}` : null);
  return (
    <>
      <PageHeader title={d.my.title} subtitle={d.my.subtitle}>
        <Link href="/submit" className={buttonVariants()}>
          <PenLine /> {d.nav.submit}
        </Link>
      </PageHeader>
      <div className="space-y-3">
        {!data && [0, 1].map((i) => <Skeleton key={i} className="h-32" />)}
        {data?.map((f) => <FeedbackCard key={f.id} f={f} onChange={(nf) => setData((l) => l?.map((x) => (x.id === nf.id ? nf : x)) ?? null)} />)}
        {data?.length === 0 && (
          <EmptyState
            icons={[ClipboardList, Lightbulb, PenLine]}
            title={d.my.empty}
            description={d.my.emptyHint}
            action={<Link href="/submit" className={buttonVariants()}>{d.nav.submit}</Link>}
          />
        )}
      </div>
    </>
  );
}
