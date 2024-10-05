import { TokenItem } from "./TokenItem";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TokenAccount } from "@/app/lib/types";
import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";

type TokenListProps = {
	tokenAccounts: TokenAccount[],
	isLoading: boolean,
	compress: (mint: PublicKey, amount: BN) => Promise<void>,
	decompress: (mint: PublicKey, amount: BN) => Promise<void>,
}

export function TokenList({ tokenAccounts, isLoading, compress, decompress }: TokenListProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	const rowVirtualizer = useVirtualizer({
		count: tokenAccounts?.length ?? 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 80,
	})

	if (isLoading) {
		return (
			<div className="h-full flex items-center justify-center">
				<span className="loading loading-spinner loading-lg" />
			</div>
		);
	}

	return (
		<>
			<div ref={parentRef} className="h-full overflow-y-auto">
				<div className={`h-[${rowVirtualizer.getTotalSize()}px] w-full relative`}>
					{rowVirtualizer.getVirtualItems().map((virtualItem) => {
						if (tokenAccounts) {
							return (
								<div
									key={virtualItem.key}
									style={{
										position: 'absolute',
										top: 0,
										left: 0,
										width: '100%',
										height: `${virtualItem.size}px`,
										transform: `translateY(${virtualItem.start}px)`
									}}
								>
									<TokenItem
										tokenAccount={tokenAccounts[virtualItem.index]}
										compress={compress}
										decompress={decompress}
									/>
								</div>
							)
						}

						return (<span key={virtualItem.key} />)
					})}
				</div>
			</div>
		</>
	);
}
