"use client";
import { useEffect, useState } from "react";

const HKM_API = "https://hikakinmaniacoin.hikamer.f5.si";
const SLUG = "narikitter-pro";
const PRICE = 1000;
const STORAGE_KEY = "hkm_pro_nareaitter";

export function HkmProBanner() {
  const [isPro, setIsPro] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("hkm_token");
    if (token) {
      const url = new URL(window.location.href);
      url.searchParams.delete("hkm_token");
      url.searchParams.delete("item");
      window.history.replaceState({}, "", url.toString());
      fetch(`${HKM_API}/api/checkout?token=${token}`)
        .then(r => r.json())
        .then(data => {
          if (data.valid && data.itemSlug === SLUG) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ until: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
            setIsPro(true);
            alert("✅ HKM Proプランを有効化しました！");
          }
        }).catch(() => {});
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { until } = JSON.parse(stored);
      if (until > Date.now()) setIsPro(true);
      else localStorage.removeItem(STORAGE_KEY);
    }
    setChecked(true);
  }, []);

  if (!checked || isPro) return null;

  const callbackUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-yellow-500/30 bg-black/90 p-4 shadow-2xl max-w-xs">
      <p className="text-xs text-yellow-400 font-bold mb-1">🪙 HKM Proプラン</p>
      <p className="text-xs text-gray-300 mb-3">月額{PRICE} HKMでPro機能解放</p>
      <a href={`${HKM_API}/checkout?item=${SLUG}&callback=${encodeURIComponent(callbackUrl)}`}
        className="block w-full rounded-lg bg-yellow-400 py-2 text-center text-xs font-bold text-black hover:bg-yellow-300">
        {PRICE} HKM/月で購入
      </a>
    </div>
  );
}

export function useHkmPro() {
  const [isPro, setIsPro] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { until } = JSON.parse(stored);
      setIsPro(until > Date.now());
    }
  }, []);
  return isPro;
}
