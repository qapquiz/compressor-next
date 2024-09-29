import type { ParsedTokenAccountData, WithTokenMetadata } from "@/app/lib/types";
import Image from "next/image";

export function TokenItem({ tokenWithMetadata }: { tokenWithMetadata: WithTokenMetadata<ParsedTokenAccountData> }) {
	function showBadge(isCompressed: boolean) {
		return isCompressed ?
			<div className="badge badge-sm badge-outline badge-accent">compressed</div> :
			<div className="badge badge-sm badge-outline badge-primary">spl</div>
	}

	return (
		<div className="flex flex-row gap-4 items-top justify-between font-mono mb-4">
			<div className="flex flex-row gap-4 items-top">
				<Image
					className="rounded-full"
					src={tokenWithMetadata.metadata.image}
					width={48}
					height={48}
					alt={`${tokenWithMetadata.metadata.name} Logo`}
				/>
				<div className="flex flex-col gap-1">
					<span>{tokenWithMetadata.metadata.symbol}</span>
					{showBadge(tokenWithMetadata.metadata.isCompressed)}
				</div>
			</div>
			<span>{tokenWithMetadata.token.info.tokenAmount.uiAmount}</span>
		</div>

	);
}
