export default {

	addAuditAction: async ({action, taskId, commentId, clientId}) => {
		try {
			const body = {
				user_id: appsmith.store.user.id,
				action: action,
				task_id: taskId,
				comment_id: commentId,
				client_id: clientId
			};

			const params = {
				collection: "tasklog",
				body: body
			};

			items.createItems(params);
			return;
		} catch (error) {
			// General catch for the entire operation
			console.error("Error in saving activity log:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	getSurnameInitials: async (user_id) => {
		const userdata = await qGetUserDataByID.run({id: user_id});
		let lastname = userdata.data.last_name;
		let firstname = userdata.data.first_name;
		let SurnameInitials = lastname + ' ' + firstname.slice(0,1) + '.';
		return SurnameInitials;
	},

	GetUsersOfficeTerms: async () => {
		// Define the fields to include in the response
		const fields = [
			"user_id.id",
			"user_id.first_name", "user_id.last_name",
			"position_id.title_id.title",
		].join(",");

		const params = {
			fields: fields,
			collection: "office_term"
		};

		try {
			const response = await items.getItems(params);
			const sourceData = response.data;
			const contacts = sourceData.map(item => ({
				id: item.user_id.id,
				last_name: item.user_id.last_name,
				first_name: item.user_id.first_name,
				initials: `${item.user_id.first_name[0]}.`,
				title: item.position_id.title_id.title
			}));
			return contacts;
		} catch (error) {
			console.error('Error fetching office terms:', error);
			throw error; // Re-throw to allow calling code to handle the error
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
		
	getClientLog: async () => {
		if (!clients.selectedClient) {
			return;
		}
		const clientId = clients.selectedClient.id;
		const params = {
			fields: "*,user_id.last_name,user_id.first_name",
			filter: JSON.stringify({ client_id: { _eq: clientId } }),
			collection: "tasklog"
		};

		try {
			const response = await items.getItems(params);
			
			return response.data || [];
		} catch (error) {
			console.error(`Error fetching logs for client ${clientId}:`, error);
			throw error; // Re-throw to allow calling code to handle the error
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
		qAuth_logout.run();
		showAlert('Успешный выход', 'success');
		clearStore();
		navigateTo('Auth');
		return
	}
}