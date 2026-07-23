export default {
	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, `${first}${middle}`].filter(Boolean).join(" ").trim();
	},

	GetUsersOfficeTerms: async () => {
		try {
			const response = await items.getItems({
				collection: "office_terms",
				fields: [
					"user_id.id",
					"user_id.first_name",
					"user_id.last_name",
					"position_id.title_id.title"
				].join(","),
				limit: -1
			});

			const sourceData = Array.isArray(response.data) ? response.data : [];
			let contacts = sourceData
			.map((item) => {
				const user = item?.user_id;
				const position = item?.position_id;

				if (!user?.id) return null;

				return {
					id: user.id,
					last_name: user.last_name || "",
					first_name: user.first_name || "",
					initials: user.first_name?.[0] ? `${user.first_name[0]}.` : "",
					title: position?.title_id?.title || ""
				};
			})
			.filter(Boolean);

			const seen = new Set();
			contacts = contacts.filter((contact) => {
				if (seen.has(contact.id)) return false;
				seen.add(contact.id);
				return true;
			});

			contacts.sort((a, b) => a.last_name.localeCompare(b.last_name));
			return contacts;
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error fetching office terms:", error);
			throw error;
		}
	},
	// for auditors and participants
	getNamesFromArray: (usersArray) => {
		// Извлекаем JSON часть из строки (удаляем "<b>Участники</b>: ")
		// Извлечение фамилий и инициалов
		if (Array.isArray(usersArray) && usersArray.length > 0) {
			const result = usersArray
			.filter(participant => participant && participant.directus_users_id) // Фильтруем некорректные элементы
			.map(participant => {
				const { last_name, first_name } = participant.directus_users_id;
				return(`${last_name} ${first_name[0]}.`);
			})
			.join(", ");
			return(result);
		} else {
			return ("");
		}
	},

	formatBytes: async (bytes, decimals = 2) => {
		if (bytes === 0) return '0 B';

		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));

		return `${value} ${sizes[i]}`;
	},

	logout: async () => {
		_qAuth_logout.run();
		showAlert('Успешный выход', 'success');
		clearStore();
		navigateTo('Auth');
		return
	}
}