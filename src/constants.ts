export const KROMER_ENDPOINT_RAW =
	process.env.KROMER_URL || "https://kromer.reconnected.cc";
export const KROMER_API_BASE_PATH = 
	process.env.KROMER_API_BASE_PATH || "/api/krist";
export const KROMER_ENDPOINT =
`${KROMER_ENDPOINT_RAW}${KROMER_ENDPOINT_RAW.endsWith("/") ? "" : "/" }${KROMER_API_BASE_PATH}`;

export const PAGINATION_MAX_LIMIT = 1000;
