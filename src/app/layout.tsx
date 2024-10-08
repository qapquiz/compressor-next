import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SolanaProvider } from "@/components/solana/solana-provider";
import { ReactQueryProvider } from "@/components/react-query/react-query-provider";

const geistSans = localFont({
	src: "./fonts/GeistVF.woff",
	variable: "--font-geist-sans",
	weight: "100 900",
});
const geistMono = localFont({
	src: "./fonts/GeistMonoVF.woff",
	variable: "--font-geist-mono",
	weight: "100 900",
});

export const metadata: Metadata = {
	title: "POINT0x",
	description: "NO MORE 0.002 SOL per token",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#101212] dark`}
			>
				<ReactQueryProvider>
					<SolanaProvider>
						<div className="bg-[#272744] text-[#fbf5ef] w-screen h-screen flex items-center justify-center">
							{children}
						</div>
					</SolanaProvider>
				</ReactQueryProvider>
			</body>
		</html>
	);
}
