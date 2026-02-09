export default {
	logout: async () => {
		try {
			if (!appsmith.store.user?.token){
				navigateTo('Auth');
				return;
			}

			const body = {
				refresh_token: appsmith.store.user.token,
				mode: "json"
			};

			const params = {
				action: "logout",
				body: body,	
			};

			await qPostAuth.run(params);
			showAlert('Успешный выход', 'success');
			clearStore();
			navigateTo('Auth');
		} catch (error) {
			console.error("Error in logout: ", error);
			showAlert('Ошибка при выходе', 'error');
			throw error; // Re-throw to allow calling code to handle the error
		}
	},
}