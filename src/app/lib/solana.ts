import {
	createAssociatedTokenAccountInstruction,
	createCloseAccountInstruction,
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
	AddressLookupTableAccount,
	ComputeBudgetProgram,
	Connection,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from "@solana/web3.js";
import {
	CompressedTokenProgram,
	selectMinCompressedTokenAccountsForTransfer,
} from "@lightprotocol/compressed-token";
import { z } from "zod";
import { insertTokenMetadata } from "./db";
import { env } from "@/env/client";
import { BN } from "@coral-xyz/anchor";
import { ok, err } from "neverthrow";
import { DatabaseError, HttpError } from "@/lib/errors";
import {
	bn,
	defaultTestStateTreeAccounts,
	type Rpc,
} from "@lightprotocol/stateless.js";
import type {
	JUPQuoteResponse,
	ParsedTokenAccountData,
	TokenAccount,
} from "./types";
import type { TokenMetadata } from "@prisma/client";
import type { Result } from "neverthrow";
import BigNumber from "bignumber.js";

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

type TokenMetadataWithPrice = TokenMetadata & { pricePerToken: number };

type JUPPriceResponse = {
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

async function fetchTokenPricesFromJUP(
	mints: string[],
): Promise<Result<JUPPriceResponse, HttpError>> {
	try {
		const response = await fetch(
			`https://api.jup.ag/price/v2?ids=${mints.join(",")}`,
		);
		return ok((await response.json()) as JUPPriceResponse);
	} catch (error) {
		return err(
			new HttpError({
				message: error instanceof Error ? error.message : "Unknown error",
			}),
		);
	}
}

async function fetchTokenMetadataFromDB(
	mints: string[],
): Promise<Result<[TokenMetadata[], string[]], DatabaseError>> {
	try {
		const response = await fetch(
			`/api/db/tokenMetadata?mints=${mints.join(",")}`,
		);
		const tokenMetadata = (await response.json()) as TokenMetadata[];
		const tokenMetadataMap = new Map(
			tokenMetadata.map((tokenMetadata) => [tokenMetadata.mint, tokenMetadata]),
		);
		const notFoundMints = mints.filter((mint) => !tokenMetadataMap.has(mint));

		return ok([tokenMetadata, notFoundMints]);
	} catch (error) {
		return err(
			new DatabaseError({
				message: error instanceof Error ? error.message : "Unknown error",
			}),
		);
	}
}

async function findTokenMetadataWithPrice(
	mints: string[],
): Promise<TokenMetadataWithPrice[]> {
	// fetch token metadata from DB
	const [tokenMetadataArray, notFoundMints] = (
		await fetchTokenMetadataFromDB(mints)
	).unwrapOr<[TokenMetadata[], string[]]>([[], mints]);
	const foundMints = tokenMetadataArray.map(
		(tokenMetadata) => tokenMetadata.mint,
	);

	// fetch token prices
	const jupResponse = (await fetchTokenPricesFromJUP(foundMints)).unwrapOr({
		data: {},
	} as JUPPriceResponse);

	const tokenMetadataWithPriceArray: TokenMetadataWithPrice[] =
		tokenMetadataArray.map((tokenMetadata) => {
			return {
				...tokenMetadata,
				pricePerToken: Number(jupResponse.data[tokenMetadata.mint]?.price ?? 0),
			};
		});

	// fetch token metadata with price from Helius
	const assetBatch = (
		await getAssetBatch(env.NEXT_PUBLIC_HELIUS_RPC_URL, notFoundMints)
	).unwrapOr([]);
	const tokenMetadataWithPriceArrayFromHelius = assetBatch.map((asset) => {
		return {
			mint: asset.id,
			symbol: asset.token_info?.symbol ?? "",
			decimals: asset.token_info?.decimals ?? 0,
			image: asset.content?.links?.image ?? "",
			pricePerToken: asset.token_info?.price_info?.price_per_token ?? 0,
		} as TokenMetadataWithPrice;
	});

	return [
		...tokenMetadataWithPriceArray,
		...tokenMetadataWithPriceArrayFromHelius,
	];
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
	const tokenMetadataWithPriceArray = await findTokenMetadataWithPrice(mints);

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

export async function createJupSwapInstructions({
	connection,
	quoteResponse,
	userPublicKey,
	preSwapInstructions,
	postSwapInstructions,
}: {
	connection: Connection;
	quoteResponse: JUPQuoteResponse;
	userPublicKey: PublicKey;
	preSwapInstructions: TransactionInstruction[];
	postSwapInstructions: TransactionInstruction[];
}): Promise<VersionedTransaction> {
	const instructions = await (
		await fetch("https://quote-api.jup.ag/v6/swap-instructions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				// quoteResponse from /quote api
				quoteResponse,
				// user public key to be used for the swap
				userPublicKey,
				// auto wrap and unwrap SOL. default is true
				wrapAndUnwrapSol: true,
				// feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
				// feeAccount: "fee_account_public_key"
			}),
		})
	).json();

	if (instructions.error) {
		throw new Error(instructions.error);
	}

	const {
		tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
		computeBudgetInstructions, // The necessary instructions to setup the compute budget.
		setupInstructions, // Setup missing ATA for the users.
		swapInstruction: swapInstructionPayload, // The actual swap instruction.
		cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
		addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
	} = instructions;

	const deserializeInstruction = (instruction: {
		programId: string;
		accounts: {
			pubkey: string;
			isSigner: boolean;
			isWritable: boolean;
		}[];
		data: string;
	}) => {
		return new TransactionInstruction({
			programId: new PublicKey(instruction.programId),
			keys: instruction.accounts.map((key) => ({
				pubkey: new PublicKey(key.pubkey),
				isSigner: key.isSigner,
				isWritable: key.isWritable,
			})),
			data: Buffer.from(instruction.data, "base64"),
		});
	};

	const getAddressLookupTableAccounts = async (
		keys: string[],
	): Promise<AddressLookupTableAccount[]> => {
		const addressLookupTableAccountInfos =
			await connection.getMultipleAccountsInfo(
				keys.map((key) => new PublicKey(key)),
			);

		return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
			const addressLookupTableAddress = keys[index];
			if (accountInfo) {
				const addressLookupTableAccount = new AddressLookupTableAccount({
					key: new PublicKey(addressLookupTableAddress),
					state: AddressLookupTableAccount.deserialize(accountInfo.data),
				});
				acc.push(addressLookupTableAccount);
			}

			return acc;
		}, new Array<AddressLookupTableAccount>());
	};

	const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

	addressLookupTableAccounts.push(
		...(await getAddressLookupTableAccounts(addressLookupTableAddresses)),
		...(await getZKCompressionAddressLookupTableAccount({ connection })),
	);

	const blockhash = (await connection.getLatestBlockhash()).blockhash;
	const messageV0 = new TransactionMessage({
		payerKey: userPublicKey,
		recentBlockhash: blockhash,
		instructions: [
			// uncomment if needed: ...setupInstructions.map(deserializeInstruction),
			...preSwapInstructions,
			...setupInstructions.map((instruction) =>
				deserializeInstruction(instruction),
			),
			deserializeInstruction(swapInstructionPayload),
			...postSwapInstructions,
			// uncomment if needed: deserializeInstruction(cleanupInstruction),
		],
	}).compileToV0Message(addressLookupTableAccounts);

	const tx = new VersionedTransaction(messageV0);

	return tx;
}

// from compressed token -> decompress -> swap -> close account -> compress
export async function createCompressedTokenJupSwapInstructions({
	connection,
	compressionRpc,
	quoteResponse,
	userPublicKey,
	tokenAccount,
	swapAmount,
}: {
	connection: Connection;
	compressionRpc: Rpc;
	quoteResponse: JUPQuoteResponse;
	userPublicKey: PublicKey;
	tokenAccount: TokenAccount;
	swapAmount: BN;
}): Promise<VersionedTransaction> {
	const preSwapIxs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: 2_000_000 }),
		// ...(await createDecompressTokenInstructions({
		// 	connection,
		// 	compressionRpc,
		// 	publicKey: userPublicKey,
		// 	mint: tokenAccount.mint,
		// 	amount: swapAmount,
		// })),
	];

	const postSwapIxs = [
		...(await createCompressTokenInstructions({
			connection,
			publicKey: userPublicKey,
			mint: tokenAccount.mint,
			amount: swapAmount,
		})),
	];

	if (tokenAccount.amount === swapAmount) {
		console.log("add CLOSE ACCOUNT");
		const ata = await getAssociatedTokenAddress(
			tokenAccount.mint,
			userPublicKey,
		);

		postSwapIxs.push(
			createCloseAccountInstruction(ata, userPublicKey, userPublicKey),
		);
	}

	return await createJupSwapInstructions({
		connection,
		quoteResponse,
		userPublicKey,
		preSwapInstructions: preSwapIxs,
		postSwapInstructions: postSwapIxs,
	});
}

export async function createCompressTokenInstructions({
	connection,
	publicKey,
	mint,
	amount,
}: {
	connection: Connection;
	publicKey: PublicKey;
	mint: PublicKey;
	amount: BN;
}): Promise<TransactionInstruction[]> {
	const ixs = [];
	if (!(await isCompressedTokenAlreadyInitialized({ connection, mint }))) {
		console.log("ADD INITIALIZE");
		const createTokenPoolIx = await CompressedTokenProgram.createTokenPool({
			feePayer: publicKey,
			mint: mint,
		});

		ixs.push(createTokenPoolIx);
	}

	const sourceAta = await getAssociatedTokenAddress(mint, publicKey);
	console.log(sourceAta.toBase58());
	const compressIx = await CompressedTokenProgram.compress({
		payer: publicKey,
		owner: publicKey,
		source: sourceAta,
		toAddress: publicKey,
		mint: mint,
		amount: amount,
		outputStateTree: defaultTestStateTreeAccounts().merkleTree,
	});

	ixs.push(compressIx);

	return ixs;
}

export async function createDecompressTokenInstructions({
	connection,
	compressionRpc,
	publicKey,
	mint,
	amount,
}: {
	connection: Connection;
	compressionRpc: Rpc;
	publicKey: PublicKey;
	mint: PublicKey;
	amount: BN;
}): Promise<TransactionInstruction[]> {
	const ixs = [];

	// check create ata first
	const ata = await getAssociatedTokenAddress(mint, publicKey);
	const isAtaInitialize = await isAccountInitialized({
		connection,
		address: ata,
	});

	if (!isAtaInitialize) {
		const createAtaIx = createAssociatedTokenAccountInstruction(
			publicKey,
			ata,
			publicKey,
			mint,
		);

		ixs.push(createAtaIx);
	}

	// get compressed token account
	const compressedTokenAccounts =
		await compressionRpc.getCompressedTokenAccountsByOwner(publicKey, {
			mint: mint,
		});

	const { compressedProof, rootIndices } =
		await compressionRpc.getValidityProof(
			compressedTokenAccounts.items.map((account) =>
				bn(account.compressedAccount.hash),
			),
		);

	const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
		compressedTokenAccounts.items,
		amount,
	);

	const decompressIx = await CompressedTokenProgram.decompress({
		payer: publicKey,
		inputCompressedTokenAccounts: inputAccounts,
		toAddress: ata,
		amount: amount,
		recentValidityProof: compressedProof,
		recentInputStateRootIndices: rootIndices,
	});

	ixs.push(decompressIx);

	return ixs;
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
