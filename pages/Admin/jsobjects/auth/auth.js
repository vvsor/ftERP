export default {
	logout: async () => {
		const refreshToken = appsmith.store?.user?.refresh_token;

		try {
			if (refreshToken) {
				await qPostAuth.run({
					action: "logout",
					body: {
						refresh_token: refreshToken,
						mode: "json"
					}
				});
			}
		} catch (error) {
			console.warn("Remote logout failed:", error);
		} finally {
			clearStore();
			showAlert("Успешный выход", "success");
			navigateTo("Auth");
		}
	}
}