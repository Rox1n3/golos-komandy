"use client";

import Link from "next/link";
import { use } from "react";
import { ChevronLeft } from "lucide-react";
import { useFetch, useI18n } from "@/components/providers";
import { DetailNotFound, FeedbackDetail } from "@/components/feedback-detail";
import { Skeleton } from "@/components/ui/primitives";
import type { FeedbackView } from "@/lib/types";

export default function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { d } = useI18n();
  const { data, setData, error } = useFetch<FeedbackView>(`/api/feedback/${id}`);
  return (
    <>
      <Link href="/ideas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> {d.nav.feed}
      </Link>
      {error ? <DetailNotFound text={d.detail.notFound} /> : data ? <FeedbackDetail f={data} setF={setData} /> : <Skeleton className="h-96" />}
    </>
  );
}
