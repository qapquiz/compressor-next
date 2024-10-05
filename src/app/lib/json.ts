export function removeTrailingCommas(jsonString: string): string {
	return jsonString.replace(/,\s*([\]}])/g, "$1");
}
