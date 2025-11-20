export default {
	defaultTab: 'Sign In',
	setDefaultTab(newTab){
		this.defaultTab = newTab;
	},

	/// ================== test block ==================
	// Test: async () => {
	// },
	/// ============== end of test block ===============

	logout: async () => {
		if (!appsmith.store?.user?.token){
			this.setDefaultTab('Sign In');
			return;
		}
		try {
			const params = {
				action: "logout",
				body: {
					refresh_token: appsmith.store.user.token,
					mode: "json"
				}
			};

			await audit.addAuditAction({action: 'logged_out'});
			await qPostAuth.run(params);

			showAlert('Успешный выход', 'success');
			clearStore();
			this.setDefaultTab('Sign In');
		} catch (error) {
			console.error("Error in logout: ", error);
			showAlert('Ошибка при выходе', 'error');
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	initAuth: async () => {
		const user = appsmith.store?.user;

		if (!user || !user.token) {
			auth.setDefaultTab('Sign In');
		} else {
			auth.setDefaultTab('Logged In')
		}
	},

	signIn: async function() {
		try {
			const body = {
				email: inp_email.text,
				password: inp_password.text
			};

			// 1. Authenticate and get token
			const response = await qAuth_login.run({ body });
			const token = response?.data?.access_token;
			if (!token) throw new Error("No token");

			// 2. Get user data by token
			const userData = await qGetUserDataByToken.run({ token });
			if (!userData?.data?.id) throw new Error("No user details");
			const { id, email, first_name, last_name, tgchannelusername } = userData.data;

			// 3. Store user in Appsmith store
			await storeValue("user", {
				id,
				email,
				token,
				first_name,
				last_name,
				tgchannelusername
			}, true);

			showAlert('Успешный вход', 'success');
			await audit.addAuditAction({action: 'logged_in'});

			auth.setDefaultTab('Logged In');
		} catch (error) {
			if (error && error.message && error.message.includes("user details")) {
				showAlert('Ошибка получения данных пользователя', 'error');
			} else {
				showAlert('Недействительная комбинация логина/пароля', 'error');
			}
			// Optionally rethrow or handle further
		}
	},

	passwordReset: async function() {
		const user_email = inp_EmailResetPassword.text;

		try {
			const body = { email: user_email };
			const params = {
				action: "password/request",
				body: body
			};

			await qPostAuth.run(params);
			showAlert('На указанный адрес отправлена ссылка для безопасной смены пароля', 'info');
			auth.setDefaultTab('Sign In');
		} catch (error) {
			showAlert('Не удалось отправить ссылку для сброса пароля. Проверьте адрес и попробуйте еще раз.', 'error');
		}
	}

}