export default {
	async addAuditAction({action, taskId, commentId, clientId}){
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

			await items.createItems(params);
		} catch (error) {
			// General catch for the entire operation
			console.error("Error in saving activity log: ", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}