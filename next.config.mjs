/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "raw.githubusercontent.com"
			},
			{
				protocol: "https",
				hostname: "arweave.net"
			},
			{
				protocol: "https",
				hostname: "fidelion.io"
			},
			{
				protocol: "https",
				hostname: "ipfs.io"
			},
			{
				protocol: "https",
				hostname: "i.pinimg.com"
			}
		]
	}
};

export default nextConfig;
