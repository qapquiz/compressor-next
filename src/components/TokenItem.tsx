import type { ParsedTokenAccountData, WithTokenMetadata } from "@/app/lib/types";
import Image from "next/image";

export function TokenItem({ tokenWithMetadata, onClick }: { tokenWithMetadata: WithTokenMetadata<ParsedTokenAccountData>, onClick: () => void }) {
	function showBadge(isCompressed: boolean) {
		return isCompressed ?
			<div className="badge badge-sm badge-outline text-[#f2d3ab] border-[#f2d3ab]">COMPRESSED</div> :
			<div className="badge badge-sm badge-outline text-[#c69fa5] border-[#c69fa5]">SPL</div>
	}

	return (
		<div
			className="flex flex-row gap-4 items-top justify-between font-mono p-4 hover:bg-[#494d7e]"
			onClick={() => { onClick() }}
		>
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
