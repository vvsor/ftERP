export default {
	/// ================== test block ==================
	// test: async () => {
	// },
	/// ============== end of test block ===============

	uploadFiles: async ({filepicker, taskId, commentId} = {}) => {
		if (!filepicker?.files || filepicker.files.length === 0) {
			console.log("No files to process");
			return { success: [], failed: [] };
		}

		const results = {	success: [],failed: [] };
		for (const file of Array.from(filepicker.files)) {
			if (!file) continue;

			try {

				const uploadResult = await qUploadFile.run(file);
				if (!taskId && !commentId) {
					results.success.push(file.name || file);
					continue;
				}

				// Prepare association data
				if (taskId) {
					try {
						const params = {
							collection: "tasks_files",
							body: {
								"task_id": taskId,
								"file_id": uploadResult.data.id
							}
						};

						// Associate file with task
						await items.createItems(params);
						results.success.push(file.name || file);
					} catch (associationError) {
						console.error("Error associating file with task: ", associationError);
						results.failed.push({ 
							file: file.name || file, 
							error: associationError,
							stage: "task_association" 
						});
					}
				}
				else {
					try {
						const params = {
							collection: "comments_files",
							body: {
								"comment_id": commentId,
								"file_id": uploadResult.data.id
							}
						};

						// Associate file with comment
						await items.createItems(params);
						console.log(`File ${file.name || "unnamed"} successfully associated with comment`);
						results.success.push(file.name || file);
					} catch (associationError) {
						console.error("Error associating file with comment: ", associationError);
						results.failed.push({ 
							file: file.name || file, 
							error: associationError,
							stage: "comment_association" 
						});
					}
				}
			} catch (uploadError) {
				results.failed.push({ 
					file: file.name || file, 
					error: uploadError,
					stage: "upload" 
				});
			}
		}
		return results;
	},

	combineTaskAndCommentFiles: async (taskId) => {
		try {
			const taskFiles = await files.getTaskFiles(taskId); // returns array of file objects
			const taskComments = await comments.getTaskComments(taskId); // returns array of comment objects
			const commentFilesArrays = await Promise.all(
				taskComments.map(comment => files.getCommentFiles(comment.id))
			);

			const commentFiles = commentFilesArrays.flat();

			// 4. Combine task files and comment files
			let allFiles = [...taskFiles, ...commentFiles];

			// 5. (Optional) Remove duplicates by file id
			const seen = new Set();
			allFiles = allFiles.filter(file => {
				if (seen.has(file.id)) return false;
				seen.add(file.id);
				return true;
			});

			return allFiles;
		} catch (error) {
			console.error("Error combining files: ", error);
			throw error;
		}
	},

	getTaskFiles: async (taskId) => {
		try {
			const params = {
				collection: "tasks",
				fields: [
					"files_id.file_id.*"
				].join(","),
				// filter: { id: { _eq: 370 } }
				filter: { id: { _eq: taskId } }
			};

			const response = await items.getItems(params);
			const flatFiles = response.data.flatMap(item =>
																							item.files_id.map(fileObj => fileObj.file_id)
																						 );
			return flatFiles;
		} catch (error) {
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	getCommentFiles: async (commentId = appsmith.store.editingComment.id) => {
		try {
			const params = {
				collection: "comments",
				fields: [
					"files_id.file_id.*"
				].join(","),
				filter: { id: { _eq: commentId } }
			};

			// Await the query response
			const response = await items.getItems(params);

			// Flatten the files array from the response
			const flatFiles = response.data.flatMap(item =>
																							item.files_id.map(fileObj => fileObj.file_id)
																						 );
			return flatFiles;
		} catch (error) {
			console.error(`Error fetching files for comment ${commentId}:`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}