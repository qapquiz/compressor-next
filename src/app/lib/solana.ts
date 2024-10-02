import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import type { TokenMetadata, ParsedTokenAccountData, WithTokenMetadata } from "./types";
import { CompressedTokenProgram } from "@lightprotocol/compressed-token";

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
	'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

export function findAssociatedTokenAddress(
	walletAddress: PublicKey,
	tokenMintAddress: PublicKey
): PublicKey {
	const [ata] = PublicKey.findProgramAddressSync(
		[
			walletAddress.toBuffer(),
			TOKEN_PROGRAM_ID.toBuffer(),
			tokenMintAddress.toBuffer(),
		],
		SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
	);

	return ata;
}

export async function isCompressedTokenAlreadyInitialized({ connection, mint }: { connection: Connection, mint: PublicKey }): boolean {
	const [pda] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('pool'),
			mint.toBuffer(),
		],
		CompressedTokenProgram.programId,
	);

	const accountInfo = await connection.getAccountInfo(pda);
	if (!accountInfo) {
		return false;
	}

	return true;
}

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
