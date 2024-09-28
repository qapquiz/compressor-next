import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, type PublicKey } from "@solana/web3.js";
import type { TokenMetadata, ParsedTokenAccountData, WithTokenMetadata } from "./types";

export async function getTokenMetadata(endpoint: string | undefined, mint: string): Promise<TokenMetadata> {
	const response = await fetch(`/api/solana/token/metadata/${mint}`)
	return await response.json();
}

export async function getTokens(endpoint: string | undefined, wallet: PublicKey): Promise<WithTokenMetadata<ParsedTokenAccountData>[]> {
	const finalEndpoint = endpoint ?? 'https://solana-mainnet.api.syndica.io/api-key/2NfVeoEdAth3xzgVRytDrdWZGoeSo5XnSuAdRPmmCmCGxCTk15CwZmoaaH6YqvTpp6JYbe2dbn1qAJTNhYkfV1iuoeZMYFbXMz4';
	const connection = new Connection(finalEndpoint);

	const rpcContextResult = await connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID })
	const tokens = rpcContextResult.value
		.map((token) => token.account.data.parsed as ParsedTokenAccountData)
		.filter((token) => token.info.tokenAmount.decimals !== 0 && token.info.tokenAmount.amount !== "0")
		.sort((tokenA, tokenB) => {
			return -1 * (tokenA.info.tokenAmount.uiAmount - tokenB.info.tokenAmount.uiAmount);
		});

	return await Promise.all(tokens.map(async (token) => {
		const metadata = await getTokenMetadata(endpoint, token.info.mint);
		return {
			metadata: metadata,
			token: token,
		} as WithTokenMetadata<ParsedTokenAccountData>
	}));
}

export async function getCompressedTokens(wallet: PublicKey) { }
