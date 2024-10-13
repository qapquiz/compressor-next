import { BN } from "@coral-xyz/anchor";
import {
	CompressedTokenProgram,
	selectMinCompressedTokenAccountsForTransfer,
} from "@lightprotocol/compressed-token";
import {
	bn,
	defaultTestStateTreeAccounts,
	type Rpc,
} from "@lightprotocol/stateless.js";
import {
	createAssociatedTokenAccountInstruction,
	createCloseAccountInstruction,
	getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
	AddressLookupTableAccount,
	type Connection,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from "@solana/web3.js";
import { Effect, pipe } from "effect";
import type { JUPQuoteResponse } from "./types";
import { getZKCompressionAddressLookupTableAccount } from "./solana";

async function isAccountInitialized(
	connection: Connection,
	publicKey: PublicKey,
) {
	const accountInfo = await connection.getAccountInfo(publicKey);
	return accountInfo !== null;
}

export function createAtaInstructionIfNeededEffect(props: {
	connection: Connection;
	publicKey: PublicKey;
	mint: PublicKey;
}): Effect.Effect<TransactionInstruction[], never, never> {
	const { connection, publicKey, mint } = props;

	const ataEffect = Effect.promise(() =>
		getAssociatedTokenAddress(mint, publicKey),
	);
	const createAtaIxIfNeeded = (connection: Connection) => (ata: PublicKey) =>
		Effect.promise(async () => {
			if (await isAccountInitialized(connection, ata)) {
				// no need to create ata
				return [] as TransactionInstruction[];
			}

			return [
				createAssociatedTokenAccountInstruction(
					publicKey,
					ata,
					publicKey,
					mint,
				),
			];
		});

	return pipe(ataEffect, Effect.flatMap(createAtaIxIfNeeded(connection)));
}

export function createCloseAccountEffect(props: {
	accountToClose: PublicKey;
	accountToReceiveRent: PublicKey;
	authority: PublicKey;
}): Effect.Effect<TransactionInstruction, never, never> {
	const { accountToClose, accountToReceiveRent, authority } = props;

	return Effect.succeed(
		createCloseAccountInstruction(
			accountToClose,
			accountToReceiveRent,
			authority,
		),
	);
}

export function createDecompressTokenInstructionEffect(props: {
	connection: Connection;
	compressionRpc: Rpc;
	publicKey: PublicKey;
	mint: PublicKey;
	decompressAmount: BN;
}): Effect.Effect<TransactionInstruction[], never, never> {
	const { connection, compressionRpc, publicKey, mint, decompressAmount } =
		props;

	const createDecompressIx = Effect.promise(async () => {
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
			decompressAmount,
		);

		const ata = await getAssociatedTokenAddress(mint, publicKey);
		const decompressIx = await CompressedTokenProgram.decompress({
			payer: publicKey,
			inputCompressedTokenAccounts: inputAccounts,
			toAddress: ata,
			amount: decompressAmount,
			recentValidityProof: compressedProof,
			recentInputStateRootIndices: rootIndices,
		});

		return decompressIx;
	});

	return Effect.Do.pipe(
		Effect.bind("createAtaIxs", () =>
			createAtaInstructionIfNeededEffect({ connection, publicKey, mint }),
		),
		Effect.bind("decompressIx", () => createDecompressIx),
		Effect.map(({ createAtaIxs, decompressIx }) => [
			...createAtaIxs,
			decompressIx,
		]),
	);
}

export function createCompressTokenInstructionEffect(props: {
	publicKey: PublicKey;
	mint: PublicKey;
	compressAmount: BN;
}): Effect.Effect<TransactionInstruction[], never, never> {
	const { publicKey, mint, compressAmount } = props;

	const createCompressIx = Effect.promise(async () => {
		const ata = await getAssociatedTokenAddress(mint, publicKey);
		const compressIx = await CompressedTokenProgram.compress({
			payer: publicKey,
			owner: publicKey,
			source: ata,
			toAddress: publicKey,
			mint: mint,
			amount: compressAmount,
			outputStateTree: defaultTestStateTreeAccounts().merkleTree,
		});

		return compressIx;
	});

	return Effect.Do.pipe(
		Effect.bind("compressIx", () => createCompressIx),
		Effect.map(({ compressIx }) => [compressIx]),
	);
}

export function createJupSwapInstructionsEffect(props: {
	quoteResponse: JUPQuoteResponse;
	publicKey: PublicKey;
}) {
	const { quoteResponse, publicKey } = props;

	const createJupSwapIxs = Effect.promise(async () => {
		const instructions = await (
			await fetch("https://quote-api.jup.ag/v6/swap-instructions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					// quoteResponse from /quote api
					quoteResponse,
					userPublicKey: publicKey.toBase58(),
				}),
			})
		).json();

		if (instructions.error) {
			throw new Error(`Failed to get swap instructions: ${instructions.error}`);
		}

		const {
			// tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
			// computeBudgetInstructions, // The necessary instructions to setup the compute budget.
			setupInstructions, // Setup missing ATA for the users.
			swapInstruction: swapInstructionPayload, // The actual swap instruction.
			// cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
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

		return {
			jupSwapIxs: [
				...setupInstructions.map(
					(instruction: {
						programId: string;
						accounts: {
							pubkey: string;
							isSigner: boolean;
							isWritable: boolean;
						}[];
						data: string;
					}) => deserializeInstruction(instruction),
				),
				deserializeInstruction(swapInstructionPayload),
			] as TransactionInstruction[],
			addressLookupTableAddresses: addressLookupTableAddresses as string[],
		};
	});

	return createJupSwapIxs;
}

export function buildVersionedTransactionEffect(props: {
	connection: Connection;
	publicKey: PublicKey;
	ixs: TransactionInstruction[];
	luts: string[];
}): Effect.Effect<VersionedTransaction, never, never> {
	const { connection, publicKey, ixs, luts } = props;

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

	const buildVersionedTransaction = Effect.promise(async () => {
		const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

		addressLookupTableAccounts.push(
			...(await getAddressLookupTableAccounts(luts)),
			...(await getZKCompressionAddressLookupTableAccount({ connection })),
		);

		const blockhash = (await connection.getLatestBlockhash()).blockhash;
		const messageV0 = new TransactionMessage({
			payerKey: publicKey,
			recentBlockhash: blockhash,
			instructions: ixs,
		}).compileToV0Message(addressLookupTableAccounts);

		return new VersionedTransaction(messageV0);
	});

	return buildVersionedTransaction;
}

// decompress(+ create ata token A if needed) -> swap -> compress (token B) -> closeAccount (token B)**
// closeAccount will be in next phase
export function createCompressedTokenSwapEffect(props: {
	connection: Connection;
	compressionRpc: Rpc;
	publicKey: PublicKey;
	tokenAMint: PublicKey;
	tokenBMint: PublicKey;
	amount: BN;
	quoteResponse: JUPQuoteResponse;
}): Effect.Effect<VersionedTransaction, never, never> {
	const {
		connection,
		compressionRpc,
		publicKey,
		tokenAMint,
		tokenBMint,
		amount,
		quoteResponse,
	} = props;

	const swapOutAmount = new BN(quoteResponse.outAmount);

	return Effect.Do.pipe(
		Effect.bind("decompressTokenAIxs", () =>
			createDecompressTokenInstructionEffect({
				connection,
				compressionRpc,
				publicKey,
				mint: tokenAMint,
				decompressAmount: amount,
			}),
		),
		Effect.bind("jupIxsWithLUTs", () =>
			createJupSwapInstructionsEffect({
				quoteResponse,
				publicKey,
			}),
		),
		// close token account A
		Effect.bind("closeAccountTokenAIx", () => {
			const ataEffect = Effect.promise(() =>
				getAssociatedTokenAddress(tokenAMint, publicKey),
			);
			return pipe(
				ataEffect,
				Effect.flatMap((ata: PublicKey) => {
					return createCloseAccountEffect({
						accountToClose: ata,
						accountToReceiveRent: publicKey,
						authority: publicKey,
					});
				}),
			);
		}),
		Effect.bind("compressTokenBIxs", () =>
			createCompressTokenInstructionEffect({
				publicKey,
				mint: tokenBMint,
				compressAmount: swapOutAmount,
			}),
		),
		Effect.map(
			({
				decompressTokenAIxs,
				jupIxsWithLUTs: { jupSwapIxs, addressLookupTableAddresses },
				compressTokenBIxs,
				closeAccountTokenAIx,
			}) => {
				return {
					ixs: [
						...decompressTokenAIxs,
						...jupSwapIxs,
						// ...compressTokenBIxs,
						closeAccountTokenAIx,
					],
					luts: addressLookupTableAddresses,
				};
			},
		),
		Effect.flatMap(({ ixs, luts }) => {
			return buildVersionedTransactionEffect({
				connection,
				publicKey,
				ixs,
				luts,
			});
		}),
	);
}

export function createTokenSwapEffect(props: {
	connection: Connection;
	publicKey: PublicKey;
	quoteResponse: JUPQuoteResponse;
}): Effect.Effect<VersionedTransaction, never, never> {
	const { connection, publicKey, quoteResponse } = props;

	return Effect.Do.pipe(
		Effect.bind("jupIxsWithLUTs", () =>
			createJupSwapInstructionsEffect({
				quoteResponse,
				publicKey,
			}),
		),
		Effect.flatMap(
			({ jupIxsWithLUTs: { jupSwapIxs, addressLookupTableAddresses } }) => {
				return buildVersionedTransactionEffect({
					connection,
					publicKey,
					ixs: jupSwapIxs,
					luts: addressLookupTableAddresses,
				});
			},
		),
	);
}
