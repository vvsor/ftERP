export default {	
	/// ================== test block ==================
	async test() {
		let a = await comments.getTaskComments(405);
		// console.log("AAA: ", a);
		return a;
	},
	/// ============== end of test block ===============

	async getTaskComments(taskId) {
		const userid = (sel_chooseEmployee.selectedOptionValue && !sel_chooseEmployee.isDisabled) ? sel_chooseEmployee.selectedOptionValue
		: appsmith.store.user.id;
		// Fields to fetch
		try {

			const fields = [
				"*",
				"author_id.id",
				"author_id.last_name",
				"author_id.first_name"
			].join(",");

			const params = {
				collection: "comments",
				fields: fields,
				filter: {	task_id: { _eq: taskId }	},
			};
			const response = await items.getItems(params);
			const taskComments = response.data;

			// Prepare and fetch unread tasks
			let unreadComments = [];
			try {
				const filter = {
					task_id: { _eq: taskId },
					user_id: { _eq: userid }
				};

				const fields = "*";
				const params = {
					fields: fields,
					collection: "unread",
					filter: filter
				};
				const response = await items.getItems(params);
				unreadComments = response.data || [];
			} catch (error) {
				console.error("Error fetching unread comments:", error);
				throw error;
			}
			console.log("unreadComments: ", unreadComments);
			// Map for quick unread lookup
			const unreadMap = new Map(unreadComments.map(unread => [unread.comment_id, unread]));

			// Combine comments with unread info
			let combinedComments = taskComments.map(comment => ({
				...comment,
				unread: unreadMap.has(comment.id)
				// unreadInfo: unreadMap.get(comment.id) || null
			}));

			combinedComments.sort((a, b) => a.id - b.id);
			return combinedComments;

		} catch (error) {
			console.error(`Error fetching comments for task ${taskId}:`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	async addComment(){
		try {
			if (!appsmith.store?.selectedTask?.id) {
				showAlert("Не выбрана задача для комментария", "warning");
				return;
			}
			const taskId = appsmith.store.selectedTask.id;

			const body = {
				task_id: taskId,
				content: rte_Comment.text,
				author_id: appsmith.store.user.id
			};

			const params = {
				collection: "comments",
				body: body
			};

			// Add comment and get response
			showAlert('Добавляем комментарий...', 'info');
			const response = await items.createItems(params);
			const commentId = response.data.id;

			// Handle file uploads if any
			if (fp_filesForComment.files?.length > 0) {
				// vvs 2do: check
				// files.uploadFiles(fp_filesForComment, undefined, commentId);
				await files.uploadFiles({ filepicker: fp_filesForComment, commentId });
			}

			// Post-comment actions
			await audit.addAuditAction({action: 'comment_added', taskId: taskId, commentId: commentId});
			showAlert('Комментарий добавлен!', 'success');
			await comments.getTaskComments(taskId);
			closeModal(mdl_addEditComment.name);

		} catch (error) {
			console.error("Error in adding comment", error);
			showAlert('Ошибка при добавлении комментария', 'error');
			throw error;
		}
	},

	icn_AddComment_onClick() {
		removeValue("editingComment");
		showModal(mdl_addEditComment.name);
	},	

	// editing comment
	lst_taskCommentsonItemClick (triggeredItem) {
		storeValue("editingComment", triggeredItem, true);
		files.getCommentFiles(triggeredItem.id);
		showModal(mdl_addEditComment.name);
	},

	closeCommentModalForData() {
		//check for added but unsaved	files
		var unsavedData = [];
		if (fp_filesForComment.files && fp_filesForComment.files.length> 0) {
			unsavedData.push("Прикрепленные файлы");
		}
		// check for unsaved test
		if (appsmith.store.editingComment.id &&
				lst_taskComments.triggeredItemView?.txt_commentText?.text !== undefined &&
				rte_Comment.text.trim() !== lst_taskComments.triggeredItemView.txt_commentText.text.trim()
			 ) {
			unsavedData.push("Текст комментария");
		}

		if (unsavedData.length > 0) {
			showModal(mdl_ConfirmUnsavedData.name);
			txt_unsavedData.setText(unsavedData.join("\n"));
		} else {
			closeModal(mdl_addEditComment.name);
		}
		// console.log(unsavedData.length);
	},


	updateComment: async () => {
		try {
			const taskId = appsmith.store.selectedTask.id;
			const commentId = lst_taskComments.triggeredItem.id;

			// Build update body dynamically
			const data = {};
			if (rte_Comment.isDirty) {
				data.content = rte_Comment.text;
			}

			let filesAttached;
			if (fp_filesForComment.files?.length > 0) {
				filesAttached = true;
			}


			// vvs 2do: remove duplicate condition in
			if (Object.keys(data).length > 0) {
				await items.updateItems({
					collection: "comments",
					body: { keys: [commentId], data }
				});
			}

			// return if no changes and files not attached
			if (Object.keys(data).length === 0 && !filesAttached) {
				showAlert('Нет изменений для сохранения', 'info');
				closeModal(mdl_addEditComment.name);
				return;
			}
			showAlert('Обновляем комментарий...', 'info');

			if (Object.keys(data).length === 0 && !filesAttached) {
				const body = {
					keys: [commentId],
					data
				};

				const params = { collection: "comments",	body: body };
				await items.updateItems(params);
			}

			// Handle file uploads if any
			if (filesAttached) {
				await files.uploadFiles({filepicker: fp_filesForComment, commentId: commentId});
			}

			// Post-update actions
			await audit.addAuditAction({action: 'comment_updated', taskId: taskId, commentId: commentId});

			showAlert('Комментарий обновлен!', 'success');
			await comments.getTaskComments(taskId);
			closeModal(mdl_addEditComment.name);

		} catch (error) {
			console.error("Error updating comment", error);
			showAlert('Ошибка при обновлении комментария', 'error');
			throw error;
		}
	}

}