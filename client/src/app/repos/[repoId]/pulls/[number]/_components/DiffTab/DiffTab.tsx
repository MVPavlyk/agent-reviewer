"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { severityByFileLine } from "./helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

/** `?diffOrder=smart|original` — URL-owned so the choice survives a reload
 *  and is shareable via link. Defaults to "smart" (param absent). */
const DIFF_ORDER_PARAM = "diffOrder";

type DiffOrder = "smart" | "original";

/** Two-segment pill switch — each option is its own clickable segment,
 *  the active one gets a lighter pill behind it, rather than a plain
 *  on/off switch flanked by static labels. */
function DiffOrderSwitch({
  value,
  onChange,
  smartLabel,
  originalLabel,
}: {
  value: DiffOrder;
  onChange: (order: DiffOrder) => void;
  smartLabel: string;
  originalLabel: string;
}) {
  const segments: Array<{ key: DiffOrder; label: string }> = [
    { key: "smart", label: smartLabel },
    { key: "original", label: originalLabel },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      {segments.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              background: active ? "var(--bg-hover)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              transition: "background .15s, color .15s",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("shell");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const severityMap = React.useMemo(() => severityByFileLine(reviews ?? []), [reviews]);

  // Smart Diff must never block the tab: fall back to the flat DiffViewer
  // while it's loading, errored, or the user explicitly asked for "original".
  const smartDiffReady = !!smartDiff && !smartDiffLoading && !smartDiffError;
  const useSmartOrder = smartDiffReady && searchParams.get(DIFF_ORDER_PARAM) !== "original";

  const setDiffOrder = (order: "smart" | "original") => {
    const sp = new URLSearchParams(searchParams.toString());
    if (order === "smart") sp.delete(DIFF_ORDER_PARAM);
    else sp.set(DIFF_ORDER_PARAM, order);
    router.replace(`${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  // Clicking a Smart Diff "N findings" badge scrolls the diff to that file's
  // first finding line. The target FileCard may still be collapsing/mounting
  // when this fires, so poll for the element across a few animation frames
  // instead of querying once — same pattern as the FindingsTab `?findingItem`
  // deep-link (client/INSIGHTS.md).
  const [scrollTarget, setScrollTarget] = React.useState<{ path: string; line: number; n: number } | null>(null);
  const handleFindingsClick = React.useCallback((path: string, line: number) => {
    setScrollTarget((prev) => ({ path, line, n: (prev?.n ?? 0) + 1 }));
  }, []);

  React.useEffect(() => {
    if (!scrollTarget) return;
    let attempts = 0;
    let raf: number;
    const tryScroll = () => {
      const el = document.querySelector(
        `[data-file-path="${CSS.escape(scrollTarget.path)}"] [data-diff-line="${scrollTarget.line}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts++ < 30) raf = requestAnimationFrame(tryScroll);
    };
    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget]);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {smartDiffReady && (
              <DiffOrderSwitch
                value={useSmartOrder ? "smart" : "original"}
                onChange={setDiffOrder}
                smartLabel={t("diffViewer.smartOrder")}
                originalLabel={t("diffViewer.originalOrder")}
              />
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {useSmartOrder && smartDiff ? (
        <SmartDiffViewer
          smartDiff={smartDiff}
          files={files}
          severityByFileLine={severityMap}
          commenting={commenting}
          onFindingsClick={handleFindingsClick}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
