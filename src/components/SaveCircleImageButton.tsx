"use client";

import { useTheme } from "next-themes";
import { useCallback, useState, type RefObject } from "react";
import {
  captureCircleElementToPngDataUrl,
  savePngDataUrlToDevice,
} from "@/lib/circle-capture-png";
import { formatSaveFailed } from "@/lib/i18n/messages";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  fileNameBase: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function SaveCircleImageButton({
  targetRef,
  fileNameBase,
  disabled = false,
  disabledReason,
}: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  const save = useCallback(async () => {
    if (disabled) return;
    const el = targetRef.current;
    if (!el) {
      setErr(t.saveNoTarget);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const isLight = resolvedTheme === "light";
      const dataUrl = await captureCircleElementToPngDataUrl(el, isLight);
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");
      const safe = fileNameBase.replace(/[^\w\u3000-\u30ff\u3040-\u309f\u4e00-\u9faf\-]/g, "_");
      const filename = `${safe || "twitter-nareai-circle"}-${stamp}.png`;
      await savePngDataUrlToDevice(dataUrl, filename);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg =
        raw && raw !== "undefined"
          ? formatSaveFailed(t.saveFailedWith, raw)
          : t.saveFailed;
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [targetRef, fileNameBase, resolvedTheme, disabled, t]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={busy || disabled}
        title={
          disabled
            ? (disabledReason ?? t.saveDisabled)
            : undefined
        }
        className="rounded-xl border border-zinc-300/90 bg-white/90 px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-sky-400/60 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800/80 dark:text-zinc-200 dark:shadow-none dark:hover:border-sky-500/40 dark:hover:bg-zinc-800 dark:hover:text-white"
      >
        {busy ? t.saveBusy : t.saveBtn}
      </button>
      {err && (
        <p className="max-w-md text-center text-xs text-rose-600 dark:text-rose-400" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
