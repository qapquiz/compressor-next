import { TokenItem } from "./TokenItem";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { getTokens } from "@/app/lib/solana";
import { PublicKey } from "@solana/web3.js";

export function TokenList() {
	// const { publicKey, connected } = useWallet();
	// const { connection } = useConnection();
	const publicKey = new PublicKey("87bdcSg4zvjExbvsUSbGifYUp75JdLhLafjgwvCjzjkA")

	const { data: parsedTokenWithMetadatas } = useQuery({
		queryKey: ["tokens", publicKey],
		queryFn: () => {
			// if (!(connected && publicKey)) {
			// 	return [];
			// }

			return getTokens(undefined, publicKey);
		},
	});

	return (
		<div className="flex flex-col">
			{parsedTokenWithMetadatas?.map((tokenWithMetadata) => (
				<TokenItem key={tokenWithMetadata.token.info.mint} tokenWithMetadata={tokenWithMetadata} />
			))}
		</div>
	);
}
