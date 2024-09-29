'use client';

import { WalletButton } from "@/components/solana/solana-provider";
import { TokenList } from "@/components/TokenList";

export default function Home() {
	return (
		<div className="w-full max-w-screen-sm h-full p-4 flex flex-col gap-4">
			<header className="flex flex-row items-center justify-between">
				<h1 className="text-xl font-mono">COMPRESSOR</h1>
				<WalletButton />
			</header>
			<main className="flex flex-col flex-1">
				<h2 className="text-lg font-mono">My Tokens</h2>
				<div className="border p-4 h-full">
					<TokenList />
				</div>
			</main>
		</div>
	);
}
