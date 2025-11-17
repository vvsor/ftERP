export default {
	selectedTask: undefined,

	setSelectedTask: async (task) => {
		this.selectedTask = task;
	},

	tbs_task_onTabSelected: async () => {
		// if task is selected and...
		if (this.selectedTask){
			const taskId = this.selectedTask.id;
			switch (tbs_task.selectedTab){
					// ...we are on comments tab
				case "Комментарии":
					// comments.getTaskComments(taskId)
					break;
					// ...we are on files tab
				case "Логи":
					// this.getTaskLog(taskId);
					break;
					// ...we are on files tab
				case "Файлы":
					// this.getTaskFiles(taskId)
					break;
			}
			// utils.addAuditAction.data("task_view",tbl_tasks.selectedRow.id);
		} else {
			return
		}
	},

	initCRMTasks: () => {
		return this.getCRMTasks()
			.then(tasksData => {
			this.selectedTask = tasksData.length > 0 ? tasksData[0] : null;
			return this.tbs_task_onTabSelected();
		})
			.catch(error => {
			console.error("Error loading tasks:", error);
		});
	},

	getClientTasks: async () => {
	},
	
	getCRMTasks: async () => {
		let userid;
		// if Substitute user is selected and not disabled
		if (sel_chooseEmployee.selectedOptionValue && !sel_chooseEmployee.isDisabled) {
			userid = sel_chooseEmployee.selectedOptionValue;  // then use this userid
		} else {
			userid = appsmith.store.user.id;  // otherwise use logged user
		}

		try {
			// Create the filter object for tasks
			const FilterObj = {
				"_or": [
					// {
					// "user_created": {
					// "_eq": userid
					// }
					// },
					{
						"assigner_id": {
							"_eq": userid
						}
					},
					{
						"assignee_id": {
							"_eq": userid
						}
					}
				]
			};

			// Convert to JSON string if necessary for the API
			const Filter = JSON.stringify(FilterObj);

			// Define the fields to include in the response
			const Fields = `
      client_id.id,
      client_id.name,
			assigner_id.id,
      assigner_id.last_name,
      assigner_id.first_name,
      assignee_id.id,
      assignee_id.last_name,
      assignee_id.first_name,
      *
    `;

			// Get user tasks
			const allTasks = await qGetCRMTasks.run({ 
				filter: Filter,
				fields: Fields
			});

			// Filter for incomplete tasks if check is set
			let filteredTasks;
			switch (chk_withCompleted.isChecked) {
				case true:
					filteredTasks = allTasks.data;
					break;
				case false:
					filteredTasks = allTasks.data.filter(task => !task.is_complete);
					break;
			}

			// Create filter object for unread tasks
			const unreadFilterObj = {
				"user_id": {
					"_eq": userid
				}
			};

			// Define the fields to include in the response
			const unreadFields = `*`;

			// Convert to JSON string if necessary for the API
			const unreadFilter = JSON.stringify(unreadFilterObj);

			// Get unread tasks with error handling
			const unreadTasks = await qGetCRMUnread.run({ 
				filter: unreadFilter,
				fields: unreadFields
			}).catch(error => {
				console.error("Error fetching unread tasks:", error);
				return { data: [] }; // Return empty array on error
			});

			// Optimize task combination using a Map for faster lookups
			const unreadMap = new Map();
			unreadTasks.data.forEach(unread => {
				unreadMap.set(unread.task_id, unread);
			});

			// Combine tasks with unread information
			const combinedTasks = filteredTasks.map(task => {
				const unreadRecord = unreadMap.get(task.id);

				if (unreadRecord) {
					return {
						...task,
						unread: true,
						unreadInfo: unreadRecord
					};
				} else {
					return {
						...task,
						unread: false
					};
				}
			});

			combinedTasks.sort((a, b) => a.id - b.id);

			return combinedTasks;
		} catch (error) {
			console.error("Error in task processing:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

}