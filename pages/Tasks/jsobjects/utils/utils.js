export default {

	/// ================== test block ==================
	// test: async () => {
	// },
	/// ============== end of test block ===============

	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name;
		const first = user.first_name?.[0];
		return `${last} ${first}.`;
	},

	getUsersOfficeTerms: async () => {
		try {
			// Define the fields to include in the response
			const fields = [
				"user_id.id",
				"user_id.first_name",
				"user_id.last_name",
				"position_id.title_id.title"
			].join(",");

			const params = {
				fields: fields,
				collection: "office_term",
			};
			const response = await items.getItems(params);

			// Transform the data as needed
			const sourceData = response.data ;
			let contacts = sourceData.map(item => ({
				id: item.user_id.id,
				last_name: item.user_id.last_name,
				first_name: item.user_id.first_name,
				initials: `${item.user_id.first_name[0]}.`,
				title: item.position_id.title_id.title
			}));
			// ✅ Remove duplicates by user ID
			const seen = new Set();
			contacts = contacts.filter(contact => {
				if (seen.has(contact.id)) return false;
				seen.add(contact.id);
				return true;
			});

			contacts.sort((a, b) => a.last_name.localeCompare(b.last_name));

			return contacts;
		} catch (error) {
			console.error('Error fetching office terms:', error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	// // for auditors and participants
	getNamesFromArray: (usersArray) => {
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

	formatBytes: (bytes, decimals = 2) => {
		if (bytes === '-') return '';
		if (bytes === 0) return '0 B';

		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));

		return String(`${value} ${sizes[i]}`);
	},

	getStatusesOfProcess: async(process_id) => {
		let current_process;
		// use process_id if was passed
		if (process_id) {
			current_process = process_id
		} else {
			// use process_id of selected task
			if (sel_TaskProcess.selectedOptionValue) {
				current_process = sel_TaskProcess.selectedOptionValue;
			} else {
				// otherwise use Process = 'Задача'
				current_process = 1;
			}
		}

		const filter = { "process_id": { "_eq": current_process	}	};
		const params = {
			fields: [
				"process_id",
				"status_id.id",
				"status_id.name",
				"order"
			].join(","),
			collection: "processes_statuses",
			// Filter: JSON.stringify(FilterObj),
			filter: filter,
		};

		try {
			const response = await items.getItems(params);
			// flatten json
			return response.data.map(item => ({
				id: item.status_id?.id,
				name: item.status_id?.name,
				order: item.order
			}));
		} catch (error) {
			console.error("Error in getting items in collection:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	getProjects: async () => {
		try {
			// Fields to fetch
			const fields = [
				"id", "name"
			].join(",");

			const params = {
				fields: fields,
				collection: "projects",
			};
			const response = await items.getItems(params);
			const allProjects = response.data || [];
			// Sort by name (ascending)
			allProjects.sort((a, b) => a.name.localeCompare(b.name));
			return allProjects;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	getTaskPriorities: async () => {
		try {
			// Fields to fetch
			const fields = [
				"id", "name", "weight"
			].join(",");

			const params = {
				fields: fields,
				collection: "task_priorities",
			};
			const response = await items.getItems(params);
			const taskPriorities = response.data || [];
			// Sort by name (ascending)
			taskPriorities.sort((a, b) => b.weight - a.weight);

			return taskPriorities;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	getProcesses: async () => {
		try {
			// Fields to fetch
			const fields = [
				"id", "name"
			].join(",");

			const params = {
				fields: fields,
				collection: "processes",
			};
			const response = await items.getItems(params);
			const allProcesses = response.data || [];
			// Sort by name (ascending)
			allProcesses.sort((a, b) => a.name.localeCompare(b.name));
			return allProcesses;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	}
}