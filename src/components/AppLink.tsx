import type { ComponentProps } from "react";
import Link from "next/link";

type Props = ComponentProps<typeof Link>;

/** 動的ルートの RSC プリフェッチを抑え、Invocation を増やしにくくする */
export function AppLink({ prefetch = false, ...rest }: Props) {
  return <Link prefetch={prefetch} {...rest} />;
}
