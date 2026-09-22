"use client";

import clsx from "clsx";
import Link from "next/link";
import {usePathname} from "next/navigation";

import {ConnectPill} from "./ConnectPill";
import {FaucetButton} from "./FaucetButton";
import {NetworkPill} from "./NetworkPill";
import {TestnetFaucetButton} from "./TestnetFaucet";

const NAV = [
  {href: "/", label: "Earn"},
  {href: "/amplify", label: "Amplify"},
  {href: "/lend", label: "Lend"},
];

export function Header() {
  const pathname = usePathname() || "/";

  return (
    <header className="border-b border-white/10 bg-forest-deep/60">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <Link href="/" className="flex shrink-0 flex-col gap-1.5" aria-label="Agama home">
          <img src="/agama-logo-beige.svg" alt="Agama" className="h-[24px] w-auto self-start" />
          <span className="text-2xs text-mute">Lending by Arrow Finance, deployed on X Layer by Agama</span>
        </Link>

        <nav className="pill-bar flex h-10 items-center gap-1 rounded-full px-1" aria-label="Main">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex h-8 items-center rounded-full px-4 text-base transition-colors",
                  active ? "bg-white/[0.12] text-white" : "text-mute hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {item.label}
                {item.href === "/lend" && <span className="ml-1.5 text-2xs text-dim">Arrow</span>}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <FaucetButton />
          <TestnetFaucetButton />
          <NetworkPill />
          <ConnectPill />
        </div>
      </div>
    </header>
  );
}
