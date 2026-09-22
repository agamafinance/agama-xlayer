import type {Metadata} from "next";
import type {ReactNode} from "react";

import {Header} from "@/components/Header";
import {NetworkBanner} from "@/components/NetworkBanner";
import {TestnetStrip} from "@/components/TestnetFaucet";

import "./globals.css";
import {Providers} from "./providers";

export const metadata: Metadata = {
  title: {default: "Agama x Arrow on X Layer", template: "%s | Agama x Arrow"},
  description:
    "Earn on your xStocks without selling them, or amplify the Agama vault yield, on Arrow Finance lending deployed on X Layer by Agama.",
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-forest text-white">
        <Providers>
          <Header />
          <NetworkBanner />
          <TestnetStrip />
          <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-6 md:px-6">{children}</main>
          <footer className="mx-auto w-full max-w-[1180px] px-4 pb-10 text-xs text-dim md:px-6">
            Lending markets by Arrow Finance, deployed on X Layer by Agama as part of the Arrow x Agama
            partnership. Stock prices from the Chainlink Data Streams oracle.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
