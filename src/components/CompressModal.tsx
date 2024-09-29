import { ParsedTokenAccountData, WithTokenMetadata } from "@/app/lib/types";

type CompressModalProps = {
	tokenWithMetadata: WithTokenMetadata<ParsedTokenAccountData> | undefined;
}

export function CompressModal(props: CompressModalProps) {
	const { tokenWithMetadata } = props;

	if (!tokenWithMetadata) {
		return <></>;
	}

	return (
		<dialog id="compressModal" className="modal modal-bottom sm:modal-middle">
			<div className="modal-box">
				<h3 className="font-bold text-lg">Do you want to compress <span className="badge text-[#8b6d9c] border-[#8b6d9c]">{tokenWithMetadata.metadata.symbol}</span>?</h3>
				<p className="py-4 flex flex-row gap-4 items-center">
					Amount:
					<input type="number" placeholder="Type here" className="input input-bordered w-full" />
				</p>
				<div className="modal-action">
					<form method="dialog">
						{/* if there is a button in form, it will close the modal */}
						<button className="btn">Close</button>
					</form>
				</div>
			</div>
		</dialog>
	);
}
