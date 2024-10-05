"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export function DecompressModal() {
	return (
		<Dialog>
			<DialogTrigger>
				<div className="btn btn-primary btn-sm text-white ">DECOMPRESS</div>
			</DialogTrigger>
			<DialogContent className="rounded" canClose>
				<DialogHeader>
					<DialogTitle className="flex items-center justify-center">
						Please confirm transaction in the wallet.
					</DialogTitle>
					<DialogDescription className="flex items-center justify-center">
						Confirming the transaction...
					</DialogDescription>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}
