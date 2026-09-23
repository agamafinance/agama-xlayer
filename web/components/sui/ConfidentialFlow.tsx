'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, Check, EyeOff, Lock } from 'lucide-react';
import { TokenIcon } from '@/components/icons/TokenIcon';
import { useConfidential } from '@/lib/sui/ConfidentialContext';
import {
  useCurrentAccount,
  useSuiClient,
  useSignPersonalMessage,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, fromHex, toHex } from '@mysten/sui/utils';
import { SealClient, SessionKey } from '@mysten/seal';
import { sha512 } from '@noble/hashes/sha2.js';
import { contra } from '@/lib/sui/contra/client';
import { DiscreteLogTable } from '@/lib/sui/contra/twisted_elgamal';
import { TokenAccount } from '@/lib/sui/contra/token_account';
import { GROUP_ORDER } from '@/lib/sui/contra/ristretto255';
import { point } from '@/lib/sui/contra/helpers';
import { useSuiState, useNav } from '@/lib/sui/hooks';
import { useSui } from '@/lib/sui/SuiContext';
import { SUI, toBaseUnits, fromBaseUnits } from '@/lib/sui/config';

// --- testnet deployment (same audit-hardened, confidential-enabled package) ---
const CONTRA_PKG = '0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080';
const ACCOUNT_REGISTRY = '0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3';
const TOKEN_REGISTRY = '0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb';
const AGUSD_PKG = '0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab';
const POOL = '0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67';
const USDC_TREASURY = '0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d';
const CT = '0x7cb730a0ee23a1d014b481930c893134a3942d39c623d9a4dd01022e70975bf2';
const WHITELIST = '0x6b2b8a3e2b85d5e5b7fb6ce557e31e1adf4d9e1c3b1d7b301c125cd3466cd9ae';
const AGUSD_TYPE = `${AGUSD_PKG}::agusd::AGUSD`;
const AGUSD_PKG_V2 = '0x8808bc82c8edf6ac939e428fff780c41b3529acafecdc797f67b9573285ad0b7';
const CT_SAGUSD = '0x493dee8c5f0aab2f5774f25b7b34cedded6a9930dced8e6121c3268913fac69b';
const VAULT = '0x29b9146405de04894f1a9e932ed7544965dd934e1460fb63bc524fb699344bc8';
const SAGUSD_TYPE = `${AGUSD_PKG}::sagusd::SAGUSD`;
const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
const DEMO_RECIPIENT = '0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4';
const SEAL_PKG = '0x78e24bc0a7e5de42d5a6f93dc8d254f75986e4cfab6ea95946680755ecb41ed6';
const SEAL_POLICY = '0x6983f5ea3f67811beb06ef956a1c457b5fdd979992a753313080c8e8df1792f1';
const KEY_SERVERS = ['0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8'];
const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=1';
const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space/v1/blobs/';
const WASM_URL = '/contra/contra_bulletproofs_wasm_bg.wasm';

function sealIdentity(owner: string): string {
  const p = fromHex(SEAL_POLICY.slice(2));
  const o = fromHex(owner.slice(2));
  const out = new Uint8Array(p.length + o.length);
  out.set(p, 0);
  out.set(o, p.length);
  return toHex(out);
}

type Log = { msg: string; digest?: string; ok: boolean };

export function ConfidentialFlow() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signMsg } = useSignPersonalMessage();
  const { mutateAsync: signExec } = useSignAndExecuteTransaction();
  const { data: suiState } = useSuiState();
  const { data: nav = 1 } = useNav(); // sagUSD NAV per share — stake output = cagUSD / nav
  const { refresh: refreshSui } = useSui();
  const owner = account?.address ?? '';
  const usdcBal = suiState?.user?.usdc ?? null; // real wallet USDC that deposits consume

  const client = useMemo(
    () => (suiClient as any).$extend(contra({ packageConfig: pkgCfg, table: DiscreteLogTable.create(16), wasmUrl: WASM_URL })),
    [suiClient],
  );

  // Take exactly `amount` base units of `coinType` from the wallet (merge + split).
  // Throws if the wallet is short — deposits consume real USDC, not fresh faucet coins.
  async function coinFromWallet(t: Transaction, coinType: string, amount: bigint) {
    const { data } = await suiClient.getCoins({ owner, coinType });
    const total = data.reduce((s, c) => s + BigInt(c.balance), 0n);
    if (!data.length || total < amount) {
      throw new Error(`Insufficient USDC: have ${(Number(total) / 1e6).toFixed(2)}, need ${(Number(amount) / 1e6).toFixed(2)} — mint more on Faucet`);
    }
    const primary = t.object(data[0].coinObjectId);
    if (data.length > 1) t.mergeCoins(primary, data.slice(1).map((c) => t.object(c.coinObjectId)));
    const [coin] = t.splitCoins(primary, [t.pure.u64(amount)]);
    return coin;
  }

  const [vk, setVk] = useState<bigint | null>(null);
  const [registered, setRegistered] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [sagBalance, setSagBalance] = useState<string | null>(null);
  const [dealDoc, setDealDoc] = useState(
    `CONFIDENTIAL — LP SIDE LETTER
Held by the undersigned investor. For my eyes only.

Investor (LP):   Meridian Family Office SPV, Ltd. (Cayman)
Beneficial owner: sealed — not to be revealed on-chain
My commitment:    $2,400,000 into Agama Private Credit

>> Keep my allocation size private. If counterparties learn
   how much I hold and when I redeem, they front-run my exits.

Terms I negotiated (MFN-protected — do not disclose to other LPs):
 · Management fee:  0.75%  (vs 1.50% standard)
 · Performance fee: 10% over a 6% hurdle
 · Redemption:      monthly, 5-day notice, priority queue
 · Co-investment:   right of first offer on Tenka senior deals
 · Reporting:       position-level look-through NAV

Why I seal this: my identity, my size and my fee terms are my
edge. Only I (viewing-key owner) — and Agama's allowlist — can
decrypt. Sealed via threshold MPC, stored on Walrus.`,
  );
  const [sealBlobId, setSealBlobId] = useState<string | null>(null);
  const [sealDecrypted, setSealDecrypted] = useState<string | null>(null);
  const [sealRevealed, setSealRevealed] = useState(false); // true = decrypted & editable; false w/ blob = masked
  const [transferred, setTransferred] = useState(false);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<Log[]>([]);
  // Confidential swap widget state
  const [mode, setMode] = useState<'deposit' | 'stake' | 'transfer'>('deposit');
  const [amount, setAmount] = useState('100');
  const [recipient, setRecipient] = useState('');

  const ta = useMemo(() => (vk && owner ? new TokenAccount(owner, AGUSD_TYPE, pkgCfg, vk) : null), [vk, owner]);
  const taSag = useMemo(() => (vk && owner ? new TokenAccount(owner, SAGUSD_TYPE, pkgCfg, vk) : null), [vk, owner]);

  // Publish confidential state to the page header (which shows masked "••••"
  // until the viewing key is derived, then the decrypted amount).
  const conf = useConfidential();
  useEffect(() => { conf.setCag(balance); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [balance]);
  useEffect(() => { conf.setCsag(sagBalance); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sagBalance]);
  // Header clicked the masked balance → derive the viewing key here.
  useEffect(() => {
    if (conf.deriveNonce > 0 && !vk && owner && !busy) deriveKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf.deriveNonce]);

  function push(msg: string, ok: boolean, digest?: string) {
    setLog((l) => [{ msg, ok, digest }, ...l].slice(0, 12));
  }
  async function exec(label: string, build: (t: Transaction) => void | Promise<void>) {
    const tx = new Transaction();
    await build(tx);
    const r = await signExec({ transaction: tx });
    push(label, true, r.digest);
    return r;
  }

  async function mergeWithRetry(tokenAccount: TokenAccount, label: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await exec(label, async (t) => {
          t.add(await client.contra.updateBalance({ tokenAccount, merge: true }));
        });
        return;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (attempt < 3 && /BalanceProof|abort code: 5|resolution failed|Missing/i.test(msg)) {
          push(`Merge retry ${attempt} (waiting for propagation)…`, true);
          await new Promise((r) => setTimeout(r, 3500));
        } else throw e;
      }
    }
  }

  async function deriveKey() {
    setBusy('Signing the viewing key…');
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(`agama-vk-${owner}`) : null;
      let s: bigint;
      if (stored) {
        s = BigInt(stored);
        push('Viewing key loaded (persisted, local)', true);
      } else {
        const { signature } = await signMsg({ message: new TextEncoder().encode('Agama — confidential viewing key v1') });
        s = BigInt('0x' + toHex(sha512(fromBase64(signature)))) % GROUP_ORDER;
        if (s === 0n) s = 1n;
        try { localStorage.setItem(`agama-vk-${owner}`, s.toString()); } catch { /* ignore */ }
        push('Viewing key derived (local, persisted, never sent)', true);
      }
      setVk(s);
      setBusy('Checking your confidential account…');
      const localTa = new TokenAccount(owner, AGUSD_TYPE, pkgCfg, s);
      try {
        const bal = await client.contra.getBalance(localTa);
        setRegistered(true);
        const amt = (Number(bal.balance.amount) / 1e6).toFixed(2);
        setBalance(amt);
        push(`Account already registered · decrypted balance: ${amt} cagUSD`, true);
        await refreshSag(s);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/does not exist|DoesNotExist|not exist/i.test(msg)) push('Account not registered yet → click ②', true);
        else push('Balance read — ' + msg.slice(0, 120), false);
      }
    } catch (e: any) {
      push('Viewing key — ' + String(e?.message ?? e).slice(0, 90), false);
    }
    setBusy('');
  }

  async function register() {
    if (!ta) return;
    setBusy('KYC: whitelisting your address…');
    try {
      try {
        const r = await fetch(SUI.whitelistApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: owner }) });
        if (r.ok) push('KYC approved (open whitelist)', true);
      } catch { /* try register anyway */ }
      setBusy('Creating + registering the confidential account…');
      await exec('Confidential account created', (t) => {
        const a = t.add(client.contra.newAccount({ owner }));
        t.add(client.contra.shareAccount({ account: a }));
      });
      await exec('Registered (KYC-gated) — public key bound', (t) => {
        t.moveCall({
          target: `${AGUSD_PKG}::confidential_agusd::register`,
          arguments: [t.object(CT), t.object(WHITELIST), t.object(client.contra.getAccountId(owner)), point(ta.publicKey.toBytes())],
        });
      });
      setRegistered(true);
    } catch (e: any) {
      push('Register — ' + String(e?.message ?? e).slice(0, 100), false);
    }
    setBusy('');
  }

  async function depositPrivate(amountStr: string) {
    if (!ta) return;
    const amt = toBaseUnits(amountStr);
    if (amt <= 0n) return;
    setBusy(`Private deposit: ${amountStr} USDC → cagUSD (encrypted amount)…`);
    try {
      await exec(`Private deposit: ${amountStr} USDC → cagUSD (encrypted)`, async (t) => {
        const usdc = await coinFromWallet(t, SUI.types.usdc, amt); // consume real USDC
        const ag = t.moveCall({ target: `${AGUSD_PKG}::agusd::mint`, arguments: [t.object(POOL), usdc] });
        t.add(client.contra.wrap({ coin: ag, receiver: owner, tokenType: AGUSD_TYPE }));
      });
      setBusy('Waiting for the wrap to finalize…');
      await new Promise((r) => setTimeout(r, 4000));
      await mergeWithRetry(ta, 'Merge → active encrypted balance');
      await refresh();
      refreshSui();
    } catch (e: any) {
      push('Deposit — ' + String(e?.message ?? e).slice(0, 100), false);
    }
    setBusy('');
  }

  async function transferPrivate(amountStr: string, recipient: string) {
    if (!ta) return;
    const amt = toBaseUnits(amountStr);
    if (amt <= 0n) return;
    const to = recipient.trim() || DEMO_RECIPIENT;
    setBusy('Confidential transfer: generating the ZK proof in-browser (wasm)…');
    try {
      await exec(`Confidential transfer: ${amountStr} cagUSD → ${to.slice(0, 8)}… (amount HIDDEN)`, async (t) => {
        const transferFn = await client.contra.transfer({ tokenAccount: ta, receiverAddress: to, amount: amt });
        t.add(transferFn);
      });
      setTransferred(true);
      await refresh();
    } catch (e: any) {
      push('Transfer — ' + String(e?.message ?? e).slice(0, 140), false);
    }
    setBusy('');
  }

  async function stakeConfidential(amountStr: string) {
    if (!ta || !taSag) return;
    const amt = toBaseUnits(amountStr);
    if (amt <= 0n) return;
    setBusy('Confidential stake: preparing…');
    try {
      let sagRegistered = false;
      try { await client.contra.getBalance(taSag); sagRegistered = true; } catch { /* not yet */ }
      if (!sagRegistered) {
        await exec('Confidential sagUSD account registered (KYC)', (t) => {
          t.moveCall({
            target: `${AGUSD_PKG_V2}::confidential_sagusd::register`,
            arguments: [t.object(CT_SAGUSD), t.object(WHITELIST), t.object(client.contra.getAccountId(owner)), point(taSag.publicKey.toBytes())],
          });
        });
      }
      setBusy('Confidential stake: cagUSD → csagUSD (unwrap + stake + wrap, encrypted)…');
      await exec(`Confidential stake: ${amountStr} cagUSD → csagUSD (encrypted yield)`, async (t) => {
        // Unwrap cagUSD → Coin<agUSD> (ZK proof), stake it, wrap the sagUSD into csagUSD.
        const unwrapFn = await client.contra.unwrap({ tokenAccount: ta, amount: amt });
        const ag = t.add(unwrapFn);
        const sag = t.moveCall({ target: `${AGUSD_PKG}::sagusd::stake`, arguments: [t.object(VAULT), ag] });
        t.add(client.contra.wrap({ coin: sag, receiver: owner, tokenType: SAGUSD_TYPE }));
      });
      setBusy('Waiting for the wrap to finalize…');
      await new Promise((r) => setTimeout(r, 4000));
      await mergeWithRetry(taSag, 'Merge csagUSD → active encrypted balance');
      await refreshSag();
      await refresh(); // cagUSD balance decreased
    } catch (e: any) {
      push('Confidential stake — ' + String(e?.message ?? e).slice(0, 140), false);
    }
    setBusy('');
  }

  async function refresh() {
    if (!ta) return;
    try {
      const bal = await client.contra.getBalance(ta);
      const active = Number(bal.balance.amount) / 1e6;
      setBalance(active.toFixed(2));
      push(`Decrypted balance: ${active.toFixed(2)} cagUSD`, true);
    } catch (e: any) {
      push('Decrypt — ' + String(e?.message ?? e).slice(0, 110), false);
    }
  }

  async function refreshSag(key?: bigint) {
    const t = key ? new TokenAccount(owner, SAGUSD_TYPE, pkgCfg, key) : taSag;
    if (!t) return;
    try {
      const bal = await client.contra.getBalance(t);
      const amt = (Number(bal.balance.amount) / 1e6).toFixed(2);
      setSagBalance(amt);
      push(`Decrypted csagUSD balance: ${amt} csagUSD (encrypted yield)`, true);
    } catch { /* not registered yet */ }
  }

  function sealClient() {
    return new SealClient({ suiClient: suiClient as any, serverConfigs: KEY_SERVERS.map((objectId) => ({ objectId, weight: 1 })), verifyKeyServers: false });
  }

  async function sealStore() {
    setBusy('Seal: encrypting your deal doc (threshold MPC)…');
    try {
      const { encryptedObject } = await sealClient().encrypt({ threshold: KEY_SERVERS.length, packageId: SEAL_PKG, id: sealIdentity(owner), data: new TextEncoder().encode(dealDoc) });
      setBusy('Walrus: decentralized storage of the encrypted blob…');
      const put = await fetch(WALRUS_PUBLISHER, { method: 'PUT', body: encryptedObject as any });
      const pj: any = await put.json();
      const blobId = pj.newlyCreated?.blobObject?.blobId ?? pj.alreadyCertified?.blobId;
      setSealBlobId(blobId);
      setSealDecrypted(null);
      setSealRevealed(false); // now sealed → masked, only Decrypt available
      push(`Deal doc encrypted (Seal) + stored on Walrus · blob ${String(blobId).slice(0, 14)}…`, true);
    } catch (e: any) {
      push('Seal store — ' + String(e?.message ?? e).slice(0, 120), false);
    }
    setBusy('');
  }

  async function sealDecrypt() {
    if (!sealBlobId) return;
    setBusy('Seal: signing the SessionKey…');
    try {
      const sk = await SessionKey.create({ address: owner, packageId: SEAL_PKG, ttlMin: 10, suiClient: suiClient as any });
      const { signature } = await signMsg({ message: sk.getPersonalMessage() });
      await sk.setPersonalMessageSignature(signature);
      setBusy('Walrus: fetching + Seal decryption…');
      const got = await fetch(WALRUS_AGGREGATOR + sealBlobId);
      const ct = new Uint8Array(await got.arrayBuffer());
      const tx = new Transaction();
      tx.moveCall({ target: `${SEAL_PKG}::access::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(fromHex(sealIdentity(owner)))), tx.object(SEAL_POLICY)] });
      const txBytes = await tx.build({ client: suiClient as any, onlyTransactionKind: true });
      const dec = await sealClient().decrypt({ data: ct, sessionKey: sk, txBytes });
      const text = new TextDecoder().decode(dec);
      setSealDecrypted(text);
      setDealDoc(text);       // show the plaintext back in the (now editable) textarea
      setSealRevealed(true);  // decrypted → editable again, can re-encrypt
      push('Deal doc decrypted — you are authorized by seal_approve (owner) ✓', true);
    } catch (e: any) {
      push('Seal decrypt — ' + String(e?.message ?? e).slice(0, 120), false);
    }
    setBusy('');
  }

  const disabled = !!busy || !owner;

  return (
    <div className="mt-4">
      {/* Steps */}
      <div className="space-y-3">
        <StepRow n="1" done={!!vk} title="Derive my viewing key" blurb="Signed once, kept local — you alone can decrypt.">
          <StepButton disabled={disabled || !!vk} busy={busy} onClick={deriveKey} label="Derive" />
        </StepRow>
        <StepRow n="2" done={registered} title="Create + register my confidential account (KYC)" blurb="Open whitelist, then a KYC-gated on-chain account.">
          <StepButton disabled={disabled || !vk || registered} busy={busy} onClick={register} label="Register" />
        </StepRow>
        {/* ③ Confidential swap widget — deposit / stake / transfer, amounts encrypted */}
        <ConfidentialSwap
          mode={mode}
          setMode={setMode}
          amount={amount}
          setAmount={setAmount}
          recipient={recipient}
          setRecipient={setRecipient}
          balance={balance}
          sagBalance={sagBalance}
          usdcBal={usdcBal}
          nav={nav}
          registered={registered}
          disabled={disabled}
          busy={busy}
          onDeposit={() => depositPrivate(amount)}
          onStake={() => stakeConfidential(amount)}
          onTransfer={() => transferPrivate(amount, recipient)}
        />
        <StepRow n="6" done={!!sealBlobId} title="Seal — my private LP document" blurb="Your side letter / allocation terms — what you don't want competitors to see. Sealed by threshold MPC, stored on Walrus; only you or the Agama allowlist can decrypt.">
          <div className="w-full md:w-[440px]">
            {!!sealBlobId && !sealRevealed ? (
              // SEALED — content masked; only Decrypt is available.
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-[#254839]/[0.05] ring-1 ring-[#254839]/12 py-12 text-fg-muted">
                <Lock className="h-6 w-6 text-[#254839]/50" />
                <div className="text-[12.5px] font-medium text-[#254839]/70">Sealed — decrypt to view</div>
                <div className="text-[14px] tracking-[0.35em] text-[#254839]/30">••••••••••••••</div>
              </div>
            ) : (
              // DRAFT or DECRYPTED — editable.
              <textarea
                value={dealDoc}
                onChange={(e) => setDealDoc(e.target.value)}
                rows={15}
                className="w-full box-border rounded-lg bg-white ring-1 ring-[#254839]/12 px-3 py-2.5 text-[11.5px] leading-[1.5] text-fg font-mono resize-y"
              />
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {!!sealBlobId && !sealRevealed ? (
                <button type="button" disabled={disabled} onClick={sealDecrypt} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#254839] text-[#fdf8ed] text-[13px] font-medium hover:bg-[#1F3D31] disabled:opacity-40">
                  <EyeOff className="h-3.5 w-3.5" /> Decrypt (owner)
                </button>
              ) : (
                <button type="button" disabled={disabled} onClick={sealStore} className="h-9 px-3 rounded-full bg-[#254839]/[0.08] text-[#254839] text-[13px] font-medium hover:bg-[#254839]/[0.16] disabled:opacity-40">
                  {sealBlobId ? 'Re-encrypt (Seal) + store (Walrus)' : 'Encrypt (Seal) + store (Walrus)'}
                </button>
              )}
            </div>
            {sealBlobId && <div className="mt-1.5 text-[11px] text-fg-muted">Walrus blob {sealBlobId.slice(0, 16)}… · public bytes, Seal-gated content</div>}
          </div>
        </StepRow>
      </div>

      {busy && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#fdfaf1] px-5 py-3 text-[13px] text-[#254839] shadow-[0_1px_3px_rgba(20,50,35,0.06)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#254839]/30 border-t-[#254839]" />
          {busy}
        </div>
      )}
    </div>
  );
}

function StepRow({ n, done, title, blurb, children }: { n: string; done?: boolean; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)] md:flex-row md:items-center">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${done ? 'bg-[#254839] text-[#fdf8ed]' : 'bg-[#254839]/[0.08] text-[#254839]'}`}>
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0">
        <div className="text-[15px] text-fg font-medium">{title}</div>
        <div className="text-[13px] text-fg-muted">{blurb}</div>
      </div>
      <div className="md:ml-auto shrink-0">{children}</div>
    </div>
  );
}

function StepButton({ disabled, busy, onClick, label }: { disabled?: boolean; busy: string; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-11 px-5 rounded-full bg-[#254839] text-[#fdf8ed] text-[14px] font-medium hover:bg-[#1F3D31] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {busy ? '…' : label}
    </button>
  );
}

function TokenPill({ sym }: { sym: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-[#254839]/[0.06] py-1.5 pl-1.5 pr-3 shrink-0">
      <TokenIcon symbol={sym} size={24} />
      <span className="text-[14px] font-medium text-fg">{sym}</span>
    </span>
  );
}

// The confidential swap card — deposit (USDC→cagUSD), stake (→csagUSD) or
// transfer (cagUSD→recipient), all with hidden amounts. Mirrors the public swap UX.
function ConfidentialSwap({
  mode, setMode, amount, setAmount, recipient, setRecipient,
  balance, sagBalance, usdcBal, nav, registered, disabled, busy,
  onDeposit, onStake, onTransfer,
}: {
  mode: 'deposit' | 'stake' | 'transfer';
  setMode: (m: 'deposit' | 'stake' | 'transfer') => void;
  amount: string; setAmount: (s: string) => void;
  recipient: string; setRecipient: (s: string) => void;
  balance: string | null; sagBalance: string | null; usdcBal: bigint | null; nav: number;
  registered: boolean; disabled: boolean; busy: string;
  onDeposit: () => void; onStake: () => void; onTransfer: () => void;
}) {
  // Label truncates to 2dp (matches the portfolio); Max fills the exact balance
  // so "deposit all" doesn't round up past what you actually hold.
  const usdcStr = usdcBal !== null ? (Math.floor(Number(usdcBal) / 1e4) / 100).toFixed(2) : '—';
  const usdcMax = usdcBal !== null ? (Number(usdcBal) / 1e6).toString() : '0';
  // Estimated output: deposit is 1:1 (cagUSD); stake is cagUSD / NAV (csagUSD shares).
  const amtN = Number(amount) || 0;
  const estOut = mode === 'stake' ? amtN / (nav || 1) : amtN;
  const estStr = estOut > 0 ? estOut.toLocaleString('en-US', { maximumFractionDigits: mode === 'stake' ? 4 : 2 }) : '0.0';
  const fromSym = mode === 'deposit' ? 'USDC' : 'cagUSD';
  const toSym = mode === 'stake' ? 'csagUSD' : 'cagUSD';
  const actionLabel = mode === 'deposit' ? 'Deposit privately' : mode === 'stake' ? 'Stake privately' : 'Send privately';
  const hint =
    mode === 'deposit' ? 'Mint and wrap into cagUSD; your balance becomes an ElGamal ciphertext on-chain.'
    : mode === 'stake' ? 'Unwrap cagUSD and stake into yield-bearing csagUSD; the amount stays encrypted.'
    : 'ZK range proof generated in your browser; the amount is hidden on-chain.';
  const run = mode === 'deposit' ? onDeposit : mode === 'stake' ? onStake : onTransfer;
  const tabs = [
    { id: 'deposit' as const, label: 'Deposit' },
    { id: 'stake' as const, label: 'Stake' },
    { id: 'transfer' as const, label: 'Transfer' },
  ];
  const noAmount = !amount || Number(amount) <= 0;

  return (
    <div className="rounded-2xl bg-[#fdfaf1] p-5 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
      <div className="flex items-center justify-between">
        <div className="text-[15px] text-fg font-medium">③ Confidential swap</div>
        <div className="text-[11px] text-fg-muted">amounts encrypted on-chain</div>
      </div>

      <div className="mt-3 flex gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setMode(t.id)}
            className={`h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors ${mode === t.id ? 'bg-[#254839] text-[#fdf8ed]' : 'bg-[#254839]/[0.08] text-[#254839] hover:bg-[#254839]/[0.16]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* FROM */}
      <div className="mt-3 rounded-2xl bg-white ring-1 ring-[#254839]/12 px-4 py-3 focus-within:ring-[#254839]/35">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-fg-muted">
          <span>From</span>
          <button type="button" onClick={() => setAmount(mode === 'deposit' ? usdcMax : (balance ?? '0'))} className="hover:text-fg">
            {mode === 'deposit' ? `Balance ${usdcStr} USDC` : `Balance ${balance ?? '—'} cagUSD`} · Max
          </button>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0"
            className="h-9 w-full bg-transparent text-[24px] text-fg placeholder:text-fg-muted/40 focus:outline-none" />
          <TokenPill sym={fromSym} />
        </div>
      </div>

      {/* arrow */}
      <div className="relative z-10 -my-2.5 flex justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#254839] text-[#fdf8ed] shadow">
          <ArrowDown className="h-4 w-4" />
        </div>
      </div>

      {/* TO */}
      <div className="rounded-2xl bg-white ring-1 ring-[#254839]/12 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-fg-muted">
          <span>To</span>
          <span>{mode === 'stake' ? `Balance ${sagBalance ?? '—'} csagUSD` : mode === 'deposit' ? `Balance ${balance ?? '—'} cagUSD` : 'recipient'}</span>
        </div>
        {mode === 'transfer' ? (
          <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x… recipient (defaults to demo address)"
            className="mt-1 h-9 w-full bg-transparent text-[14px] text-fg placeholder:text-fg-muted/40 focus:outline-none" />
        ) : (
          <div className="mt-1 flex items-center gap-3">
            <div className="h-9 w-full text-[24px] text-fg tabular-nums">{estStr}</div>
            <TokenPill sym={toSym} />
          </div>
        )}
      </div>

      <p className="mt-2.5 text-[12px] text-fg-muted">{hint}</p>

      <div className="mt-3">
        <button type="button" disabled={disabled || !registered || noAmount} onClick={run}
          className="h-12 w-full rounded-full bg-[#254839] text-[#fdf8ed] text-[15px] font-medium hover:bg-[#1F3D31] disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? 'Confirming…' : actionLabel}
        </button>
      </div>
      {!registered && <p className="mt-2 text-center text-[12px] text-fg-muted">Complete ① and ② above to unlock.</p>}
    </div>
  );
}
