import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy policy for Twitter Mutual Circle — advertising (Google AdSense / Amazon Associates), cookies, and how public data is handled.",
  alternates: { canonical: "/en/privacy" },
};

export default function PrivacyPageEn() {
  return <PrivacyPolicy locale="en" />;
}
