export default {
	refreshPromise: null,
	authFailureHandled: false,

	getErrorText(error) {
		const parts = [
			error?.message,
			error?.error,
			error?.data,
			error?.responseMeta?.body
		];

		try {
			parts.push(JSON.stringify(error));
		} catch (_) {}

		return parts.filter(Boolean).join(" | ");
	},

	isTokenExpiredError(error) {
		const text = items.getErrorText(error).toLowerCase();
		return text.includes("token expired") || text.includes("token_expired");
	},

	async refreshAccessToken() {
		if (items.refreshPromise) {
			return await items.refreshPromise;
		}

		items.refreshPromise = (async () => {
			const user = appsmith.store?.user;
			const refreshToken = user?.refresh_token;

			if (!refreshToken) {
				throw new Error("Missing refresh_token");
			}

			const response = await qPostAuth.run({
				action: "refresh",
				body: {
					refresh_token: refreshToken,
					mode: "json"
				}
			});

			const accessToken = response?.data?.access_token;
			const nextRefreshToken = response?.data?.refresh_token || refreshToken;
			const nextTokenExpMs = items.getTokenExpMsFromToken(accessToken);

			if (!accessToken) {
				throw new Error("No access_token in refresh response");
			}

			await storeValue("user", {
				...user,
				token: accessToken,
				refresh_token: nextRefreshToken,
				token_exp_ms: nextTokenExpMs || user?.token_exp_ms || null
			}, true);

			items.authFailureHandled = false;


			return accessToken;
		})();

		try {
			return await items.refreshPromise;
		} finally {
			items.refreshPromise = null;
		}
	},

	async handleRefreshFailure(error) {
		if (!items.authFailureHandled) {
			items.authFailureHandled = true;
			console.error("Refresh flow failed:", error);
			clearStore();
			showAlert("Сессия истекла. Войдите снова.", "warning");
			navigateTo("Auth");
		}

		const authError = new Error("AUTH_REFRESH_FAILED");
		authError.authHandled = true;
		authError.cause = error;
		throw authError;
	},

	async runWithRefresh(runQuery) {
		try {
			await items.ensureFreshToken();
		} catch (refreshError) {
			return await items.handleRefreshFailure(refreshError);
		}

		try {
			return await runQuery();
		} catch (error) {
			if (!items.isTokenExpiredError(error)) {
				throw error;
			}

			try {
				await items.refreshAccessToken();
			} catch (refreshError) {
				return await items.handleRefreshFailure(refreshError);
			}

			return await runQuery();
		}
	},


	createItems: async (params = {}) => {
		const { fields = "*", collection, filter = {}, body = {}, limit = -1 } = params;

		return await items.runWithRefresh(() =>
																			qCreateItems.run({ fields, filter, body, limit, collection })
																		 );
	},

	updateItems: async (params = {}) => {
		const { fields = "*", collection, filter = {}, body = {}, limit = -1 } = params;

		if (!body || !collection) {
			throw new Error("Both 'body' and 'collection' must be defined.");
		}

		return await items.runWithRefresh(() =>
																			qUpdateItems.run({ fields, filter, body, limit, collection })
																		 );
	},

	getItems: async (params = {}) => {
		const { fields = "*", collection, filter = {}, body = {}, limit = -1 } = params;

		if (!fields || !collection) {
			throw new Error("Both 'fields' and 'collection' must be defined.");
		}

		return await items.runWithRefresh(() =>
																			qGetItems.run({ fields, filter, body, limit, collection })
																		 );
	},

	deleteItems: async (params = {}) => {
		const { fields = "*", collection, filter = {}, body = {}, limit = -1 } = params;

		if (!body || Object.keys(body).length === 0) {
			throw new Error("You must specify body for deletion!");
		}

		return await items.runWithRefresh(() =>
																			qDeleteItems.run({ fields, filter, body, limit, collection })
																		 );
	},

	//proactive auth token
	parseJwtPayload(token) {
		if (!token) return null;

		try {
			const payloadPart = token.split(".")[1];
			if (!payloadPart) return null;

			const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
			const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);

			return JSON.parse(atob(padded));
		} catch (error) {
			console.warn("Failed to parse JWT payload:", error);
			return null;
		}
	},

	getTokenExpMsFromToken(token) {
		const exp = Number(items.parseJwtPayload(token)?.exp);
		return Number.isFinite(exp) ? exp * 1000 : 0;
	},

	getStoredTokenExpMs() {
		const stored = Number(appsmith.store?.user?.token_exp_ms);
		if (Number.isFinite(stored) && stored > 0) return stored;

		return items.getTokenExpMsFromToken(appsmith.store?.user?.token);
	},

	isTokenExpiringSoon(bufferMs = 60000) {
		const expMs = items.getStoredTokenExpMs();
		if (!expMs) return false;

		return Date.now() + bufferMs >= expMs;
	},

	async ensureFreshToken(bufferMs = 60000) {
		const user = appsmith.store?.user;
		if (!user?.token || !user?.refresh_token) return;

		if (!items.isTokenExpiringSoon(bufferMs)) {
			return;
		}

		await items.refreshAccessToken();
	}
}
