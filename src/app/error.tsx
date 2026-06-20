"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">問題が発生しました</h2>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-emerald-600 px-6 py-2 text-white"
        >
          再試行
        </button>
      </div>
    </div>
  );
}
