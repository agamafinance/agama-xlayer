import type {Metadata} from "next";

import {EarnView} from "@/components/earn/EarnView";

export const metadata: Metadata = {title: "Earn on your stocks"};

export default function Page() {
  return <EarnView />;
}
