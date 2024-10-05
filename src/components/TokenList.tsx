"use client"

import { TokenItem } from "./TokenItem";
import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TokenAccount } from "@/app/lib/types";

type TokenListProps = {
	tokenAccounts: TokenAccount[],
	isLoading: boolean,
}

export function TokenList({ tokenAccounts, isLoading }: TokenListProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const [selectedToken, setSelectedToken] = useState<TokenAccount>()
	// const { publicKey, connected } = useWallet();

	// const { data: parsedTokenWithMetadatas, isLoading: isLoadingTokens } = useQuery({
	// 	queryKey: ["tokens", publicKey],
	// 	queryFn: () => {
	// 		if (!(publicKey && connected)) {
	// 			return [];
	// 		}
	//
	// 		return getTokens(env.NEXT_PUBLIC_SYNDICA_RPC_URL, publicKey);
	// 	},
	// });

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
									<TokenItem onClick={() => {
										setSelectedToken(tokenAccounts[virtualItem.index]);
									}} tokenAccount={tokenAccounts[virtualItem.index]} />
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
