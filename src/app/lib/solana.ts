import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, type PublicKey } from "@solana/web3.js";
import type { TokenMetadata, ParsedTokenAccountData, WithTokenMetadata } from "./types";

export async function getTokenMetadata(mint: string): Promise<TokenMetadata> {
	const response = await fetch(`/api/solana/token/metadata/${mint}`)
	return await response.json();
}

export async function getTokens(endpoint, wallet: PublicKey): Promise<WithTokenMetadata<ParsedTokenAccountData>[]> {
	const connection = new Connection(endpoint);

	const rpcContextResult = await connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID })
	const tokens = rpcContextResult.value
		.map((token) => token.account.data.parsed as ParsedTokenAccountData)
		.filter((token) => token.info.tokenAmount.decimals !== 0 && token.info.tokenAmount.amount !== "0")
		.sort((tokenA, tokenB) => {
			return -1 * (tokenA.info.tokenAmount.uiAmount - tokenB.info.tokenAmount.uiAmount);
		});

	return await Promise.all(tokens.map(async (token) => {
		const metadata = await getTokenMetadata(token.info.mint);
		return {
			metadata: metadata,
			token: token,
		} as WithTokenMetadata<ParsedTokenAccountData>
	}));
}

export async function getCompressedTokens(wallet: PublicKey) { }
