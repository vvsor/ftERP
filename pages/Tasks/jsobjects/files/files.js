export default {
	/// ================== test block ==================
	test: async () => {
		// console.log("this.selectedItem: ", this.selectedItem);
		// console.log("this.savedTaskId: ", this.savedTaskId);
		// closeModal(mdl_addEditTask.name);
		// await files.uploadFiles({filepicker: fp_taskFiles, taskId: 370});

		// await files.uploadFiles({filepicker: fp_filesForComment, commentId: 73});

		// console.log("fp_filesForComment: ", fp_filesForComment);
		// console.log("fp_taskFiles: ", fp_taskFiles);

		return files.combineTaskAndCommentFiles(370);
		// return files.getTaskFiles(370);
		// return files.getCommentFiles(73);
	},
	/// ============== end of test block ===============
	
	uploadFiles: async ({filepicker, taskId, commentId} = {}) => {
		if (!filepicker?.files || filepicker.files.length === 0) {
			// temp for test
			// filepicker = fp_taskFiles;
			// taskId = 370;
			// end temp for test
			console.log("No files to process");
			return { success: [], failed: [] };
		}

		const results = {	success: [],failed: [] };
		// Process files sequentially
		for (const file of Array.from(filepicker.files)) {
			if (!file) {
				console.log("Skipping null file entry");
				continue;
			}

			console.log(`Processing file: ${file.name || "unnamed file"}`);

			try {
				// Upload the file
				const params = {
					file: file
				};

				const uploadResult = await qUploadFile.run(params);
				console.log("File uploaded successfully:", uploadResult);
				// console.log("taskId: ", taskId);
				// console.log("commentId: ", commentId);

				if (!taskId && !commentId) {
					// If no task or comment ID, just record success without associating
					results.success.push(file.name || file);
					continue;
				}

				// Prepare association data
				if (taskId) {
					console.log("taskId: ", taskId);
					console.log("uploadResult.data.id: ", uploadResult.data.id);

					try {
						const body = {
							"task_id": taskId,
							"file_id": uploadResult.data.id
						};

						const params = {
							collection: "tasks_files",
							body: body
						};

						// Associate file with task
						await items.createItems(params);
						// console.log(`File ${file.name || "unnamed"} successfully associated with task`);
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
						const body = {
							"comment_id": commentId,
							"file_id": uploadResult.data.id
						};

						const params = {
							collection: "comments_files",
							body: body
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
				console.error("Error uploading file:", uploadError);
				results.failed.push({ 
					file: file.name || file, 
					error: uploadError,
					stage: "upload" 
				});
			}
		}

		// console.log("All files processed", results);
		return results;
	},

	combineTaskAndCommentFiles: async (taskId) => {
		try {
			// 1. Get files attached directly to the task
			const taskFiles = await files.getTaskFiles(taskId); // returns array of file objects
			// 2. Get all comments for the task
			const taskComments = await comments.getTaskComments(taskId); // returns array of comment objects

			// 3. For each comment, get its files (in parallel)
			const commentFilesArrays = await Promise.all(
				taskComments.map(comment => files.getCommentFiles(comment.id))
			);

			// Flatten the array of arrays into a single array
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
			// Define the fields to include in the response
			const fields = [
				"files_id.file_id.*"
			].join(",");

			const params = {
				collection: "tasks",
				fields: fields,
				// filter: { id: { _eq: 370 } }
				filter: { id: { _eq: taskId } }
			};

			const response = await items.getItems(params);
			console.log("RESP: ", response);
			const flatFiles = response.data.flatMap(item =>
																							item.files_id.map(fileObj => fileObj.file_id)
																						 );
			return flatFiles;
		} catch (error) {
			console.error(`Error fetching files for task ${taskId}: `, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	getCommentFiles: async (commentId = appsmith.store.editingComment.id) => {
		try {
			const fields = [
				"files_id.file_id.*"
			].join(",");

			const params = {
				collection: "comments",
				fields: fields,
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