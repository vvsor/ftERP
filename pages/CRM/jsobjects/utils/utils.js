export default {
	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, `${first}${middle}`].filter(Boolean).join(" ").trim();
	},

	GetUsersOfficeTerms: () => {
		// Create the filter object
		const FilterObj = {
			// "id": {
			// "_eq": taskId
			// // "_eq": "209"
		};
		// Convert to JSON string if necessary for the API
		const Filter = JSON.stringify(FilterObj);

		// Define the fields to include in the response
		const Fields = `
				user_id.id,
				user_id.first_name,
				user_id.last_name,
				position_id.title_id.title
			`;

		return _qGetUsersOfficeTerms.run({ 
			filter: Filter,
			fields: Fields
		})
			.then(response => {
			// console.log(`Retrieved ${response.data?.length || 0} comments for task ${taskId}`);
			// const Sorted = response.data;
			// Sorted.sort((a, b) => b.id - a.id);
			// console.log(Sorted.data);
			const sourceData=response.data;
			const contacts = sourceData.map(item => ({
				id: item.user_id.id,
				last_name: item.user_id.last_name,
				first_name: item.user_id.first_name,
				initials: `${item.user_id.first_name[0]}.`,
				title: item.position_id.title_id.title
			}));
			return contacts;
		})
			.catch(error => {
			console.error(`Error fetching office terms:`, error);
			throw error; // Re-throw to allow calling code to handle the error
		});
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