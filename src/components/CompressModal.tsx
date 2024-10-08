import {
	findAssociatedTokenAddress,
	isCompressedTokenAlreadyInitialized,
} from "@/app/lib/solana";
import type {
	ParsedTokenAccountData,
	WithTokenMetadata,
} from "@/app/lib/types";
import { CompressedTokenProgram } from "@lightprotocol/compressed-token";
import {
	buildTx,
	defaultTestStateTreeAccounts,
} from "@lightprotocol/stateless.js";
import {
	WalletNotConnectedError,
	WalletSendTransactionError,
} from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, Connection, PublicKey } from "@solana/web3.js";
import { useCallback } from "react";

type CompressModalProps = {
	tokenWithMetadata: WithTokenMetadata<ParsedTokenAccountData>;
};

export function CompressModal({ tokenWithMetadata }: CompressModalProps) {
	const { publicKey, sendTransaction } = useWallet();
	const { connection } = useConnection();

	const compressToken = useCallback(
		async (connection: Connection, amount: number) => {
			if (!publicKey) {
				throw new WalletNotConnectedError();
			}

			const mint = new PublicKey(tokenWithMetadata.token.info.mint);
			const sourceAta = findAssociatedTokenAddress(publicKey, mint);

			const ixs = [
				ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
			];

			if (!isCompressedTokenAlreadyInitialized({ connection, mint })) {
				const createTokenPoolIx = await CompressedTokenProgram.createTokenPool({
					feePayer: publicKey,
					mint: mint,
				});

				ixs.push(createTokenPoolIx);
			}

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

			const {
				context: { slot: minContextSlot },
				value: blockhashCtx,
			} = await connection.getLatestBlockhashAndContext();
			const tx = buildTx(ixs, publicKey, blockhashCtx.blockhash);

			try {
				const signature = await sendTransaction(tx, connection, {
					minContextSlot,
				});
				const txResultCtx = await connection.confirmTransaction({
					blockhash: blockhashCtx.blockhash,
					lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
					signature,
				});

				if (!txResultCtx.value.err) {
					// show toast success here
					console.log("success");
				} else {
					// show toast error here
					console.log("error");
				}
			} catch (error) {
				if (error instanceof WalletSendTransactionError) {
					console.error(error);
				}
			}
		},
		[publicKey, sendTransaction],
	);

	return (
		<dialog id="compressModal" className="modal modal-bottom sm:modal-middle">
			<div className="modal-box">
				<h3 className="font-bold text-lg">
					Do you want to compress{" "}
					<span className="badge text-[#8b6d9c] border-[#8b6d9c]">
						{tokenWithMetadata.metadata.symbol}
					</span>
					?
				</h3>
				<p className="py-4 flex flex-row gap-4 items-center">
					Amount:
					<input
						type="number"
						placeholder="Type here"
						className="input input-bordered w-full"
					/>
				</p>
				<div className="modal-action">
					<div>
						{/* if there is a button in form, it will close the modal */}
						<button
							className="btn"
							onClick={() => {
								compressToken(connection, 100);
							}}
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</dialog>
	);
}
