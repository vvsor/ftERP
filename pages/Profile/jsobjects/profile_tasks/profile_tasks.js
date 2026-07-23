export default {
	async saveProfile() {
		const user = appsmith.store?.user;
		if (!user?.id || !user?.token) {
			showAlert("Сессия не найдена. Войдите снова.", "warning");
			return;
		}

		const body = {
			first_name: inp_nameProfile.text?.trim() || "",
			last_name: inp_surnameProfile.text?.trim() || "",
			middle_name: inp_middlenameProfile.text?.trim() || "",
			email: inp_emailProfile.text?.trim().toLowerCase() || ""
		};

		if (!body.first_name || !body.last_name) {
			showAlert("Заполните имя и фамилию", "warning");
			return;
		}

		if (!body.email || !inp_emailProfile.isValid) {
			showAlert("Укажите корректный email", "warning");
			return;
		}

		try {
			await qUpdateMyProfile.run({ body });
			await storeValue("user", { ...user, ...body }, true);
			showAlert("Профиль сохранен", "success");
		} catch (error) {
			console.error("Profile update failed:", error);
			showAlert("Не удалось сохранить профиль", "error");
		}
	}
}