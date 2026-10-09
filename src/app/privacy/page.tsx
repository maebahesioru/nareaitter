import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "Twitter馴れ合いサークル(馴れ合い表)のプライバシーポリシー。広告(Google AdSense・Amazonアソシエイト)・Cookie・公開データの取り扱いについて。",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PrivacyPolicy locale="ja" />;
}
