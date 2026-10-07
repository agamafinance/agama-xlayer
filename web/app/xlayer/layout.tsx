'use client';

import {SignoChat} from '@/components/SignoChat';
import {useWallet} from '@/lib/xlayer/useXLayer';

/// Every X Layer page gets the agent in the corner. It sits in a layout rather
/// than in each page so it survives navigation between Earn, Amplify and the
/// rest without losing the thread.
/// Off until Signo enables the partner scope on our key. Without it every
/// question comes back 403, so the bubble would only be a way to fail. Set
/// NEXT_PUBLIC_SIGNO_CHAT=1 to turn it on; nothing else has to change.
const ENABLED = process.env.NEXT_PUBLIC_SIGNO_CHAT === '1';

export default function XLayerLayout({children}: {children: React.ReactNode}) {
  const {address} = useWallet();
  return (
    <>
      {children}
      {ENABLED && <SignoChat wallet={address ?? undefined} />}
    </>
  );
}
