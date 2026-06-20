"use client";

import { useCallback, useState, useMemo } from "react";
import { useLocale } from "@/components/LocaleProvider";
import type { CircleUser, SelfProfile } from "@/types/circle";
import {
  DIAGNOSIS_DEFS,
  generatePrompt,
  type DiagnosisType,
} from "@/lib/ai-prompts";

type Props = {
  self: SelfProfile;
  users: CircleUser[];
};

const AI_APPS = [
  { name: "ChatGPT", url: "https://chat.openai.com/" },
  { name: "Claude", url: "https://claude.ai/" },
  { name: "Gemini", url: "https://gemini.google.com/" },
  { name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { name: "Grok", url: "https://x.com/i/grok" },
];

export function AIDiagnosisPanel({ self, users }: Props) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<DiagnosisType | null>(null);
  const [partner, setPartner] = useState("");
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(() => {
    if (!selected || !self.screenName) return "";
    return generatePrompt(
      selected,
      locale as "ja" | "en",
      self.screenName,
      users,
      DIAGNOSIS_DEFS.find((d) => d.id === selected)?.needsPartner ? partner || undefined : undefined,
    );
  }, [selected, self.screenName, users, partner, locale]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [prompt]);

  const def = DIAGNOSIS_DEFS.find((d) => d.id === selected);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DIAGNOSIS_DEFS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSelected(selected === d.id ? null : d.id)}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
              selected === d.id
                ? "border-emerald-500/50 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-950/30"
                : "border-zinc-200/80 bg-white/70 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/20"
            }`}
          >
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {locale === "ja" ? d.title.ja : d.title.en}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {locale === "ja" ? d.desc.ja : d.desc.en}
            </p>
          </button>
        ))}
      </div>

      {selected && def?.needsPartner && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-500">
              {locale === "ja" ? "相性診断する相手のXユーザー名" : "Partner X username"}
            </label>
            <input
              type="text"
              value={partner}
              onChange={(e) => setPartner(e.target.value.replace(/^@+/, ""))}
              placeholder={locale === "ja" ? "例: nhk_news" : "e.g. nhk_news"}
              className="mt-1 w-full rounded-xl border border-zinc-300/90 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-sky-500/50 focus:outline-none dark:border-white/10 dark:bg-black/30 dark:text-zinc-100"
            />
          </div>
        </div>
      )}

      {selected && prompt && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-900/60">
            <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {locale === "ja" ? "生成されたプロンプト（コピーしてAIに貼り付け）" : "Generated prompt (copy & paste to AI)"}
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-zinc-800 dark:bg-black/40 dark:text-zinc-200">
              {prompt}
            </pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              {copied
                ? (locale === "ja" ? "コピーしました！" : "Copied!")
                : (locale === "ja" ? "プロンプトをコピー" : "Copy Prompt")}
            </button>
            {AI_APPS.map((app) => (
              <a
                key={app.name}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-300/90 bg-white/90 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-sky-400/60 dark:border-white/15 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:border-sky-500/40"
              >
                {app.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
