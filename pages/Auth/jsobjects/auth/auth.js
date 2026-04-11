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

			const accessToken = response?.data?.access_token;
			const refreshToken = response?.data?.refresh_token;


			if (!accessToken || !refreshToken) {
				throw new Error("No access_token or refresh_token");
			}

			const payload = jwt_decode(accessToken);

			const allowedRoles = [
				"a0258883-621a-4e27-a1f3-4a0f99ea1de6",	// "ERP users" role
				"cbdd561a-af1b-4602-a606-74b8d824220f"	// "ERP+Salary users" role
			];

			if (!allowedRoles.includes(payload.role)) {
				showAlert('Нет прав доступа', 'error');
				return;
			}

			// 2. Get user data by token
			const userData = await qGetUserDataByToken.run({ token: accessToken });
			if (!userData?.data?.id) throw new Error("No user details");
			const { id, email, first_name, last_name, tgchannelusername } = userData.data;

			// 3. Store user in Appsmith store
			await storeValue("user", {
				id,
				email,
				token: accessToken,
				refresh_token: refreshToken,
				role: payload.role,
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