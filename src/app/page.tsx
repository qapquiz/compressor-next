'use client';

import PortfolioPage from "@/components/PortfolioPage";

// import { WalletButton } from "@/components/solana/solana-provider";
// import { TokenList } from "@/components/TokenList";

export default function Home() {
	return (
		<PortfolioPage />
	);

	// return (
	// 	<div className="w-full max-w-screen-sm h-full p-4 flex flex-col gap-4">
	// 		<header className="flex flex-row items-center justify-between h-[48px]">
	// 			<h1 className="text-xl font-mono font-bold">COMPRESSOR</h1>
	// 			<WalletButton />
	// 		</header>
	// 		<main className="flex flex-col flex-1">
	// 			<h2 className="text-lg font-mono font-bold">My Tokens</h2>
	// 			<div className="border border-white rounded h-full">
	// 				<TokenList />
	// 			</div>
	// 		</main>
	// 	</div>
	// );
}
