import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type {
	AddressLookupTableAccount,
	Connection,
	PublicKey,
} from "@solana/web3.js";
import { CompressedTokenProgram } from "@lightprotocol/compressed-token";
import { z } from "zod";
import { insertTokenMetadata } from "./db";
import { env } from "@/env/client";
import { BN } from "@coral-xyz/anchor";
import { ok, err } from "neverthrow";
import { HttpError } from "@/lib/errors";
import type { Rpc } from "@lightprotocol/stateless.js";
import type { ParsedTokenAccountData, TokenAccount } from "./types";
import type { TokenMetadata } from "@prisma/client";
import type { Result } from "neverthrow";
import BigNumber from "bignumber.js";
import { findTokenMetadataWithPrice } from "./getTokenMetadata";

const heliusAssetBatch = z.object({
	interface: z.enum(["FungibleToken"]),
	id: z.string(),
	content: z
		.object({
			links: z
				.object({
					image: z.string().url().optional(),
				})
				.optional(),
		})
		.optional(),
	token_info: z
		.object({
			symbol: z.string(),
			decimals: z.number().int(),
			token_program: z.string(),
			price_info: z
				.object({
					price_per_token: z.number(),
					currency: z.string(),
				})
				.optional(),
		})
		.optional(),
});

export type HeliusAssetBatch = z.infer<typeof heliusAssetBatch>;

export type TokenMetadataWithPrice = TokenMetadata & { pricePerToken: number };

export type JUPPriceResponse = {
	data: {
		[mint: string]: {
			id: string;
			type: string;
			price: string;
		};
	};
	timeTaken: number;
};

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export function findAssociatedTokenAddress(
	walletAddress: PublicKey,
	tokenMintAddress: PublicKey,
): PublicKey {
	const [ata] = PublicKey.findProgramAddressSync(
		[
			walletAddress.toBuffer(),
			TOKEN_PROGRAM_ID.toBuffer(),
			tokenMintAddress.toBuffer(),
		],
		SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
	);

	return ata;
}

export async function isAccountInitialized({
	connection,
	address,
}: { connection: Connection; address: PublicKey }): Promise<boolean> {
	const accountInfo = await connection.getAccountInfo(address);
	if (!accountInfo) {
		return false;
	}

	return true;
}

export async function isCompressedTokenAlreadyInitialized({
	connection,
	mint,
}: { connection: Connection; mint: PublicKey }): Promise<boolean> {
	const [pda] = PublicKey.findProgramAddressSync(
		[Buffer.from("pool"), mint.toBuffer()],
		CompressedTokenProgram.programId,
	);

	return await isAccountInitialized({ connection, address: pda });
}

export async function getTokenMetadata(mint: string): Promise<TokenMetadata> {
	const response = await fetch(`/api/solana/token/metadata/${mint}`);
	return (await response.json()) as TokenMetadata;
}

async function getAssetBatch(
	heliusUrl: string,
	mints: string[],
): Promise<Result<HeliusAssetBatch[], HttpError>> {
	try {
		if (mints.length === 0) {
			return ok([]);
		}

		const response = await fetch(heliusUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "armry-compressor",
				method: "getAssetBatch",
				params: {
					ids: mints,
				},
			}),
		});
		const { result } = await response.json();
		return ok(result);
	} catch (error) {
		return err(
			new HttpError({
				message: error instanceof Error ? error.message : "Unknown error",
			}),
		);
	}
}

export async function getTokens(
	endpoint: string,
	wallet: PublicKey,
): Promise<TokenAccount[]> {
	const connection = new Connection(endpoint);

	const rpcContextResult = await connection.getParsedTokenAccountsByOwner(
		wallet,
		{ programId: TOKEN_PROGRAM_ID },
	);
	const tokens = rpcContextResult.value
		.map((token) => token.account.data.parsed as ParsedTokenAccountData)
		.filter(
			(token) =>
				token.info.tokenAmount.decimals !== 0 &&
				token.info.tokenAmount.amount !== "0",
		)
		.sort((tokenA, tokenB) => {
			return (
				-1 *
				(tokenA.info.tokenAmount.uiAmount - tokenB.info.tokenAmount.uiAmount)
			);
		});

	const mints = tokens.map((token) => token.info.mint);
	const tokenMetadataWithPriceArray = await findTokenMetadataWithPrice(
		mints.map((mint) => new PublicKey(mint)),
	);

	const tokenAccounts = tokens.map((token) => {
		const tokenMetadataWithPrice = tokenMetadataWithPriceArray.find(
			(tokenMetadataWithPrice) =>
				tokenMetadataWithPrice.mint === token.info.mint,
		);
		return {
			symbol: tokenMetadataWithPrice?.symbol ?? "",
			mint: new PublicKey(token.info.mint),
			decimals: tokenMetadataWithPrice?.decimals ?? 0,
			image: tokenMetadataWithPrice?.image ?? 0,
			amount: new BN(token.info.tokenAmount.amount),
			pricePerToken: tokenMetadataWithPrice?.pricePerToken ?? 0,
			tokenType: "spl",
		} as TokenAccount;
	});

	// insert to database for future use
	insertTokenMetadata(
		tokenAccounts.map((tokenAccount) => {
			return {
				symbol: tokenAccount.symbol,
				mint: tokenAccount.mint.toBase58(),
				decimals: tokenAccount.decimals,
				image: tokenAccount.image,
			};
		}),
	);

	return tokenAccounts;
}

export async function getCompressedTokens(
	compressionRpc: Rpc,
	publicKey: PublicKey,
): Promise<TokenAccount[]> {
	const accounts =
		await compressionRpc.getCompressedTokenAccountsByOwner(publicKey);
	const deduplicatedAccounts = accounts.items.reduce(
		(acc, current) => {
			const existingAccount = acc.find((item) =>
				item.parsed.mint.equals(current.parsed.mint),
			);
			if (existingAccount) {
				existingAccount.parsed.amount = existingAccount.parsed.amount.add(
					current.parsed.amount,
				);
			} else {
				acc.push(current);
			}

			return acc;
		},
		[] as typeof accounts.items,
	);

	const assetIds = deduplicatedAccounts.map((account) =>
		account.parsed.mint.toBase58(),
	);
	const assetData = (
		await getAssetBatch(env.NEXT_PUBLIC_HELIUS_RPC_URL, assetIds)
	).unwrapOr([]);

	const tokenAccounts = deduplicatedAccounts.map((account) => {
		const asset = assetData.find(
			(assetDatum) => assetDatum.id === account.parsed.mint.toBase58(),
		);
		return {
			symbol: asset?.token_info?.symbol || "",
			mint: account.parsed.mint,
			amount: account.parsed.amount,
			decimals: asset?.token_info?.decimals || 0,
			image: asset?.content?.links?.image || "",
			pricePerToken: asset?.token_info?.price_info?.price_per_token || 0,
			tokenType: "compressed",
		} as TokenAccount;
	});

	insertTokenMetadata(
		tokenAccounts.map((tokenAccount) => {
			return {
				symbol: tokenAccount.symbol,
				mint: tokenAccount.mint.toBase58(),
				decimals: tokenAccount.decimals,
				image: tokenAccount.image,
			};
		}),
	);

	return tokenAccounts;
}

export async function getZKCompressionAddressLookupTableAccount({
	connection,
}: { connection: Connection }): Promise<AddressLookupTableAccount[]> {
	const lookupTableAccount = await connection.getAddressLookupTable(
		new PublicKey("9NYFyEqPkyXUhkerbGHXUXkvb4qpzeEdHuGpgbgpH1NJ"),
	);

	if (!lookupTableAccount.value) {
		throw new Error("ZKCompression AddressLookupTableAccount not found.");
	}

	return [lookupTableAccount.value];
}

export function toUIAmount(lamports: string, decimals: number): string {
	const tenPowerDecimals = new BigNumber(10).pow(decimals);
	const resultAmountBigNumber = new BigNumber(lamports).dividedBy(
		tenPowerDecimals,
	);

	return resultAmountBigNumber.toString();
}

export function toLamports(uiAmount: number | string, decimals: number): BN {
	const tenPowerDecimals = new BigNumber(10).pow(decimals);
	const resultAmountBigNumber = new BigNumber(uiAmount).multipliedBy(
		tenPowerDecimals,
	);

	return new BN(resultAmountBigNumber.toString());
}
