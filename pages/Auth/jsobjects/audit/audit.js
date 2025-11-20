export default {
	async addAuditAction({action, taskId, commentId, clientId}){
		if (!appsmith.store?.user?.id) return;
		try {
			const body = {
				user_id: appsmith.store.user.id,
				action: action,
				task_id: taskId,
				comment_id: commentId,
				client_id: clientId
			};

			return await items.createItems({
				collection: "tasklog",
				body
			});

		} catch (error) {
			// General catch for the entire operation
			console.error("Error in saving activity log: ", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}