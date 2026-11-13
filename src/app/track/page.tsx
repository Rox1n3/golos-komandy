"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useFetch, useI18n } from "@/components/providers";
import { DetailNotFound, FeedbackDetail } from "@/components/feedback-detail";
import { Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { PageHeader } from "@/components/feedback-bits";
import type { FeedbackView } from "@/lib/types";

function Track() {
  const { d } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code")?.toUpperCase() ?? "";
  const [value, setValue] = useState(code);
  useEffect(() => setValue(code), [code]);
  const { data, setData, error, loading } = useFetch<FeedbackView>(code ? `/api/track/${encodeURIComponent(code)}` : null);

  return (
    <>
      <PageHeader title={d.track.title} subtitle={d.track.text} />
      <Card className="mb-6 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/track?code=${encodeURIComponent(value.trim())}`);
          }}
        >
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-accent" />
            <Input value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} placeholder="GL-XXXX-XXXX" className="pl-11 font-mono tracking-wider" aria-label={d.track.title} />
          </div>
          <Button type="submit" className="h-11">{d.home.trackBtn}</Button>
        </form>
      </Card>
      {code && loading && !data && <Skeleton className="h-96" />}
      {code && error && <DetailNotFound text={d.track.notFound} />}
      {data && <FeedbackDetail f={data} setF={setData} code={code} />}
    </>
  );
}

export default function TrackPage() {
  return (
    <Suspense>
      <Track />
    </Suspense>
  );
}
