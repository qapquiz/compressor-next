import type { TokenAccount } from "@/app/lib/types";
import { Button } from "./ui/button";
import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";

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
			<div className="badge badge-sm badge-outline text-[#f2d3ab] border-[#f2d3ab]">
				COMPRESSED
			</div>
		) : (
			<div className="badge badge-sm badge-outline text-[#c69fa5] border-[#c69fa5]">
				SPL
			</div>
		);
	}

	return (
		<div
			className="flex flex-row gap-4 items-top justify-between font-mono p-4 hover:bg-[#494d7e]"
			onClick={() => {
				tokenAccount.tokenType === "compressed"
					? decompress(tokenAccount.mint, tokenAccount.amount)
					: compress(tokenAccount.mint, tokenAccount.amount);
			}}
		>
			<div className="flex flex-row gap-4 items-top">
				<img
					className="rounded-full"
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
				<span>{tokenAccount.amount / 10 ** tokenAccount.decimals}</span>
				<Button className="font-mono font-bold">
					{tokenAccount.tokenType === "compressed" ? "DECOMPRESS" : "COMPRESS"}
				</Button>
			</div>
		</div>
	);
}
