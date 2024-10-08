import type { TokenAccount } from "@/app/lib/types";
import { Button } from "./ui/button";
import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";
import { Atom } from "lucide-react";

type TokenItemProps = {
	tokenAccount: TokenAccount;
	compress: (mint: PublicKey, amount: BN) => Promise<void>;
	decompress: (mint: PublicKey, amount: BN) => Promise<void>;
};

export function TokenItem({
	tokenAccount,
	compress,
	decompress,
}: TokenItemProps) {
	function showBadge(isCompressed: boolean) {
		return isCompressed ? (
			<div className="flex flex-row items-center justify-center gap-1 badge badge-sm badge-outline text-[#f2d3ab] border-[#f2d3ab]">
				<Atom className="w-[10px] h-[10px] text-#f2d3ab" /> COMPRESSED
			</div>
		) : (
			<div className="badge badge-sm badge-outline text-[#c69fa5] border-[#c69fa5]">
				SPL
			</div>
		);
	}

	const tokenUIAmount = (
		tokenAccount.amount /
		10 ** tokenAccount.decimals
	).toFixed(4);
	const tokenValue = (
		Number(tokenUIAmount) * tokenAccount.pricePerToken
	).toFixed(2);

	return (
		<div className="flex flex-row gap-4 items-top justify-between font-mono p-4 hover:bg-[#494d7e]">
			<div className="flex flex-row gap-4 items-top">
				<img
					className="rounded-full w-[48px] h-[48px]"
					src={tokenAccount.image}
					width={48}
					height={48}
					alt={`${tokenAccount.symbol} Logo`}
				/>
				<div className="flex flex-col gap-1">
					<span className="font-mono font-bold">{tokenAccount.symbol}</span>
					{showBadge(tokenAccount.tokenType === "compressed")}
				</div>
			</div>
			<div className="flex flex-row items-center justify-center gap-2">
				<div className="flex flex-col items-end gap-1">
					<span>{tokenUIAmount}</span>
					<span className="text-stone-500">${tokenValue}</span>
				</div>
				<Button
					className="font-mono font-bold"
					onClick={() => {
						tokenAccount.tokenType === "compressed"
							? decompress(tokenAccount.mint, tokenAccount.amount)
							: compress(tokenAccount.mint, tokenAccount.amount);
					}}
				>
					{tokenAccount.tokenType === "compressed" ? "DECOMPRESS" : "COMPRESS"}
				</Button>
			</div>
		</div>
	);
}
