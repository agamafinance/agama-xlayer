import type {Metadata} from "next";

import {AmplifyView} from "@/components/amplify/AmplifyView";

export const metadata: Metadata = {title: "Amplify"};

export default function Page() {
  return <AmplifyView />;
}
