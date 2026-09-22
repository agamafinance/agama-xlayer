import {NextResponse} from "next/server";
import {
  createPublicClient,
  createTestClient,
  encodeAbiParameters,
  hexToBigInt,
  http,
  isAddress,
  keccak256,
  numberToHex,
  type Address,
} from "viem";

import {FORK_ID, xLayerFork} from "@/lib/chains";
import {deployments} from "@/lib/generated/deployments";

export const dynamic = "force-dynamic";

const FORK_RPC = process.env.FORK_RPC_URL || "http://127.0.0.1:8545";

// Storage slot of the ERC20 balance mapping in each token (USDG: 1, wrappers: 101).
const USDG_BALANCE_SLOT = 1n;
const WRAPPER_BALANCE_SLOT = 101n;

const USDG_AMOUNT = 10_000n * 10n ** 6n;
const STOCK_AMOUNT = 10n * 10n ** 18n;
const OKB_AMOUNT = 10n * 10n ** 18n;

function balanceSlot(user: Address, slot: bigint) {
  return keccak256(encodeAbiParameters([{type: "address"}, {type: "uint256"}], [user, slot]));
}

/// POST {address} -> credits USDG, the four wrapped xStocks and OKB on the
/// local anvil fork. Refuses to run against anything but chain 1961.
export async function POST(req: Request) {
  let address: string | undefined;
  try {
    ({address} = (await req.json()) as {address?: string});
  } catch {
    return NextResponse.json({ok: false, error: "Body must be JSON {address}"}, {status: 400});
  }
  if (!address || !isAddress(address)) {
    return NextResponse.json({ok: false, error: "Invalid address"}, {status: 400});
  }
  const user = address as Address;

  const d = deployments[FORK_ID];
  if (!d) return NextResponse.json({ok: false, error: "No fork deployment (deployments/1961.json)"}, {status: 404});

  const transport = http(FORK_RPC);
  const pub = createPublicClient({chain: xLayerFork, transport});
  const test = createTestClient({chain: xLayerFork, mode: "anvil", transport});

  try {
    const chainId = await pub.getChainId();
    if (chainId !== FORK_ID) {
      return NextResponse.json({ok: false, error: `RPC is chain ${chainId}, expected ${FORK_ID}`}, {status: 409});
    }

    const credits: {token: Address; slot: bigint; amount: bigint}[] = [
      {token: d.tokens.USDG, slot: USDG_BALANCE_SLOT, amount: USDG_AMOUNT},
      {token: d.tokens.wTSLAx, slot: WRAPPER_BALANCE_SLOT, amount: STOCK_AMOUNT},
      {token: d.tokens.wNVDAx, slot: WRAPPER_BALANCE_SLOT, amount: STOCK_AMOUNT},
      {token: d.tokens.wSPYx, slot: WRAPPER_BALANCE_SLOT, amount: STOCK_AMOUNT},
      {token: d.tokens.wAAPLx, slot: WRAPPER_BALANCE_SLOT, amount: STOCK_AMOUNT},
    ];

    for (const c of credits) {
      const index = balanceSlot(user, c.slot);
      const current = await pub.getStorageAt({address: c.token, slot: index});
      const next = (current && current !== "0x" ? hexToBigInt(current) : 0n) + c.amount;
      await test.setStorageAt({address: c.token, index, value: numberToHex(next, {size: 32})});
    }

    const okb = await pub.getBalance({address: user});
    await test.setBalance({address: user, value: okb + OKB_AMOUNT});

    return NextResponse.json({ok: true, credited: {USDG: "10000", wrappedEach: "10", OKB: "10"}});
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return NextResponse.json({ok: false, error: `Fork RPC error: ${msg}`}, {status: 502});
  }
}
