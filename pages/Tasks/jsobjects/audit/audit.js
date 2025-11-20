export default {
	addAuditAction: async ({action, taskId, commentId, clientId}) => {
		try {

			const params = {
				collection: "tasklog",
				body: {
					user_id: appsmith.store.user.id,
					action: action,
					task_id: taskId,
					comment_id: commentId,
					client_id: clientId
				}
			};

			await items.createItems(params);
		} catch (error) {
			// General catch for the entire operation
			console.error("Error in saving activity log: ", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	async getTaskLog(){
		if (!appsmith.store.selectedTask) {
			return;
		}

		const taskId = appsmith.store.selectedTask.id;
		const params = {
			fields: "*,user_id.last_name,user_id.first_name",
			filter: { task_id: { _eq: taskId } },
			collection: "tasklog"
		};

		try {
			const response = await items.getItems(params);

			return response.data || [];
		} catch (error) {
			console.error(`Error fetching logs for task ${taskId}:`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}