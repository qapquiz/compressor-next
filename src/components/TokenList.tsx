"use client"

import { TokenItem } from "./TokenItem";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { getTokens } from "@/app/lib/solana";
import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CompressModal } from "./CompressModal";
import { ParsedTokenAccountData, WithTokenMetadata } from "@/app/lib/types";

export function TokenList() {
	const parentRef = useRef<HTMLDivElement>(null);
	const [parentHeight, setParentHeight] = useState(0);
	useEffect(() => {
		const updateHeight = () => {
			if (parentRef.current) {
				setParentHeight(parentRef.current.clientHeight);
			}
		}

		updateHeight();

		window.addEventListener('resize', updateHeight);

		return () => {
			window.removeEventListener('resize', updateHeight);
		}
	}, [])

	const [selectedToken, setSelectedToken] = useState<WithTokenMetadata<ParsedTokenAccountData>>()
	const { publicKey, connected } = useWallet();

	const { data: parsedTokenWithMetadatas, isLoading: isLoadingTokens } = useQuery({
		queryKey: ["tokens", publicKey],
		queryFn: () => {
			if (!(publicKey && connected)) {
				return [];
			}

			return getTokens(undefined, publicKey);
		},
	});

	const rowVirtualizer = useVirtualizer({
		count: parsedTokenWithMetadatas?.length ?? 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 80,
	})

	if (isLoadingTokens) {
		return (
			<div className="h-full flex items-center justify-center">
				<span className="loading loading-spinner loading-lg"></span>
			</div>
		);
	}

	return (
		<>
			<div ref={parentRef} className="h-full overflow-y-auto">
				<div className={`h-[${rowVirtualizer.getTotalSize()}px] w-full relative`}>
					{rowVirtualizer.getVirtualItems().map((virtualItem) => {
						console.log(JSON.stringify(virtualItem, null, 2))
						if (parsedTokenWithMetadatas) {
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
										setSelectedToken(parsedTokenWithMetadatas[virtualItem.index]);
										document.getElementById("compressModal")?.showModal();
									}} tokenWithMetadata={parsedTokenWithMetadatas[virtualItem.index]} />
								</div>
							)
						}

						return (<span key={virtualItem.key} />)
					})}
				</div>
			</div>
			<CompressModal tokenWithMetadata={selectedToken}/>
		</>
	);
}
