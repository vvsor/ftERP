export default {
	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, `${first}${middle}`].filter(Boolean).join(" ").trim();
	},

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

	GetUsersOfficeTerms: async () => {
		const fields = [
			"id",
			"date_from",
			"date_till",
			"user_id.id",
			"user_id.first_name",
			"user_id.middle_name",
			"user_id.last_name",
			"position_id.id",
			"position_id.position_title_id.title",
			"position_id.branch_id.id",
			"position_id.branch_id.name"
		].join(",");

		const today = moment().format("YYYY-MM-DD");
		const params = {
			fields: fields,
			collection: "office_terms",
			filter: {
				_and: [
					{ date_from: { _lte: today } },
					{ _or: [{ date_till: { _null: true } }, { date_till: { _gte: today } }] }
				]
			},
			limit: -1
		};

		try {
			const response = await items.getItems(params);
			const seen = new Set();
			const contacts = (response.data || [])
			.map((item) => {
				const user = item?.user_id;
				const position = item?.position_id;
				if (!user?.id || seen.has(user.id)) return null;
				seen.add(user.id);
				return {
					id: user.id,
					last_name: user.last_name || "",
					first_name: user.first_name || "",
					middle_name: user.middle_name || "",
					initials: user.first_name?.[0] ? `${user.first_name[0]}.` : "",
					title: position?.position_title_id?.title || "",
					branch_id: position?.branch_id?.id || "",
					branch_name: position?.branch_id?.name || "",
					label: utils.formatUserName(user)
				};
			})
			.filter(Boolean)
			.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
			return contacts;
		} catch (error) {
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
	}
}