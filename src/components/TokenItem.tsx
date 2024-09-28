import type { ParsedTokenAccountData, WithTokenMetadata } from "@/app/lib/types";
import Image from "next/image";

export function TokenItem({ tokenWithMetadata }: { tokenWithMetadata: WithTokenMetadata<ParsedTokenAccountData> }) {
	return (
		<>
			<Image
				src={tokenWithMetadata.metadata.image}
				width={48}
				height={48}
				alt={`${tokenWithMetadata.metadata.name} Logo`}
			/>
			<span key={tokenWithMetadata.token.info.mint}>{tokenWithMetadata.metadata.symbol}: {tokenWithMetadata.token.info.mint} {tokenWithMetadata.token.info.tokenAmount.uiAmount}</span>
		</>
	);
}
