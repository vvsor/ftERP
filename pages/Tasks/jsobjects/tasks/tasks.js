export default {
	// Tasks' js object
	/// ================== test block ==================
	// async Test(){
	// // const task = appsmith.store.selectedTask;
	// // console.log("this.curAuditorsIds: ", appsmith.store.user);
	// },
	/// ============== end of test block ===============

	async setSelectedTask(task) {
		if (task?.id) {
			await storeValue("selectedTask", task, true);
		} else {
			await removeValue("selectedTask");
		}
		await removeValue("savedTaskID");
	},

	getSourceTaskById(taskId, fallbackRows = []) {
		const rowsFromAction = Array.isArray(tasks.getTasks.data) ? tasks.getTasks.data : [];
		const rows = rowsFromAction.length ? rowsFromAction : fallbackRows;
		return rows.find((row) => row.id === taskId) || null;
	},

	async tbl_tasks_onRowSelected(){
		const taskId = tbl_tasks.selectedRow?.id;
		if (!taskId) return;

		const row = this.getSourceTaskById(taskId);
		if (!row) {
			console.warn(`Source task ${taskId} not found`);
			return;
		}

		await this.setSelectedTask(row);
		await this.tbs_task_onTabSelected();
		// await audit.addAuditAction({ action: "task_view", taskId });
	},


	async getTasks(){
		// Determine user ID: substitute or logged-in user
		const userid = (sel_chooseEmployee.selectedOptionValue && !sel_chooseEmployee.isDisabled)
		? sel_chooseEmployee.selectedOptionValue
		: appsmith.store?.user?.id;

		if (!userid) {
			throw new Error("user id missing");
		}

		let allTasks = [];
		try {
			// Prepare filter for tasks (assigner, assignee, auditor, participant)
			const orConditions = [
				{ assigner: { _eq: userid } },
				{ assignee: { _eq: userid } },
				{ auditor_ids: {directus_users_id: { _eq: userid } } },
				{ participant_ids: {directus_users_id: { _eq: userid } } }
			];

			// Fields to fetch
			const tasksFields = [
				"id", "title", "description", "deadline", 
				"task_priority_id.*",
				"status_id.id", "status_id.name",
				"process_id.id", "process_id.name",
				"assigner.id", "assigner.last_name", "assigner.first_name",
				"assignee.id", "assignee.last_name", "assignee.first_name",
				"project_id.name", "project_id.id",
				"auditor_ids.directus_users_id.id",
				"auditor_ids.directus_users_id.last_name",
				"auditor_ids.directus_users_id.first_name",
				"participant_ids.directus_users_id.id",
				"participant_ids.directus_users_id.last_name",
				"participant_ids.directus_users_id.first_name",
				"files_id",
				"unread.id",
				"unread.user_id",
			].join(",");

			const params = {
				fields: tasksFields,
				collection: "tasks",
				filter: { _or: orConditions }
			};
			const tasksResponse = await items.getItems(params);

			allTasks = tasksResponse.data || [];
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}

		// Filter incomplete tasks if needed
		const filteredTasks = chk_withCompleted.isChecked ?	allTasks : allTasks.filter(task => task.status_id?.name !== "Завершена")
		let combinedTasks = filteredTasks.map(task => ({
			...task,
			unread: task.unread?.some(u => u.user_id === userid) || false,
			unreadInfo: task.unread?.find(u => u.user_id === userid) || null
		}));

		// Sort by id (ascending)
		combinedTasks.sort((a, b) => a.id - b.id);
		return combinedTasks;
	},

	async initTasks(){
		const user = appsmith.store?.user;

		// если операция восстановления ещё не завершена — просто не уходить на Auth
		// если user уже проверен и его нет — уходить
		if (!user || !user.token) {
			if (appsmith.store.user?.email === 'vvs@osagent.ru') {
				showAlert('DEV bypass: normal user go to auth page, while vvs@osagent.ru stays here', 'warning');
			} else {
				showAlert('Требуется авторизация. Перенаправление на страницу входа.', 'info');
				navigateTo("Auth");
			}
			return;
		}

		try {
			await items.ensureFreshToken();
			const tasksData = await this.getTasks();
			// Only call tab selection if a task exists
			if (tasksData.length > 0 ) {
				await this.setSelectedTask(tasksData[0]);
				await this.tbs_task_onTabSelected();
			}
			await Promise.all([
				utils.getProcesses(),
				utils.getStatusesOfProcess(),
				utils.getUsersOfficeTerms(),
				utils.getProjects(),
				utils.getTaskPriorities(),
				employees.getBranches(),
				employees.getSpheres(),
				employees.getFunctionals()
			]);
			// console.log("CUR_SELECTED_TASK before return:", tasks.selectedItem);
			return;
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading tasks:", error);
		}
	},

	async addTask(){
		const authorId = appsmith.store?.user?.id;
		if (!authorId) throw new Error("user id missing");
		try {
			const body = {
				project_id: sel_TaskProject.selectedOptionValue,
				title: inp_TaskTitle.text,
				deadline: dt_TaskDeadline.selectedDate,
				task_priority_id: sel_TaskPriority.selectedOptionValue,
				status_id: sel_TaskStatus.selectedOptionValue,
				process_id: sel_TaskProcess.selectedOptionValue,
				assigner: sel_TaskAssigner.selectedOptionValue,
				assignee: sel_TaskAssignee.selectedOptionValue,
				description: inp_TaskComment.text,
				author_id: authorId
			};

			const params = {
				collection: "tasks",
				body: body
			};

			// 1. Create main task
			showAlert('Создаем задачу...', 'info');
			const newTask = await items.createItems(params);
			const taskId = newTask.data.id;

			// 2. Upload files (if any)
			if (fp_taskFiles.files?.length > 0) {
				await files.uploadFiles({ filepicker: fp_taskFiles, taskId });
			}

			// 3. Process relations (auditors/participants)
			const updates = [];
			updates.push(...this.processRelationUpdate(sel_TaskAuditors, taskId, appsmith.store.curAuditorsIds || [], "tasks_auditors"));
			updates.push(...this.processRelationUpdate(sel_TaskParticipants, taskId, appsmith.store.curParticipantsIds || [], "tasks_participants"));

			if (updates.length > 0) await Promise.all(updates);

			// 4. Refresh tasks (triggers table reactivity)
			const withNewTasks = await this.getTasks();
			await tbl_tasks.setData(withNewTasks);

			// 5. Select the new row after data refresh
			const index = withNewTasks.findIndex(row => row.id === taskId);
			await tbl_tasks.setSelectedRowIndex(index);

			if (index >= 0) {
				await this.setSelectedTask(withNewTasks[index]);
				await this.tbs_task_onTabSelected();
			}

			// 6. Finalize
			// await audit.addAuditAction({action: 'task_added', taskId: taskId});

			showAlert('Задача создана!', 'success');
			closeModal(mdl_addEditTask.name);
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error in task processing:", error);
			showAlert("Ошибка при создании задачи", "error");
			throw error;
		}
	},

	// function for add & update task
	processRelationUpdate(widget, taskId, currentIds, collection) {
		if (!widget.isDirty) return [];
		const newIds = widget.selectedOptionValues;
		const toAdd = newIds.filter(id => !currentIds.includes(id));
		const toRemove = currentIds.filter(id => !newIds.includes(id));
		const ops = [];
		if (toAdd.length) {
			ops.push(
				items.createItems({
					collection,
					body: toAdd.map(userId => ({ tasks_id: taskId, directus_users_id: userId }))
				})
			);
		}
		if (toRemove.length) {
			ops.push(
				items.deleteItems({
					collection,
					body: {
						query: {
							filter: {
								tasks_id: { _eq: taskId },
								directus_users_id: { _in: toRemove }
							}
						}
					}
				})
			);
		}
		return ops;
	},

	async updateTask(){
		try {
			const taskId = appsmith.store?.selectedTask?.id;
			const editorId = appsmith.store?.user?.id;

			if (!taskId) {
				showAlert("Задача не выбрана", "error");
				return;
			}
			if (!editorId) {
				throw new Error("user id missing");
			}

			// Helper to add only dirty fields
			const addIfDirty = (obj, key, widget, valueKey = 'text') => {
				if (widget.isDirty) obj[key] = widget[valueKey];
			};

			// Build update body with only changed fields
			const data = {};
			[
				['project_id', sel_TaskProject, 'selectedOptionValue'],
				['title', inp_TaskTitle],
				['deadline', dt_TaskDeadline, 'selectedDate'],
				['task_priority_id', sel_TaskPriority, 'selectedOptionValue'],
				['status_id', sel_TaskStatus, 'selectedOptionValue'],
				['process_id', sel_TaskProcess, 'selectedOptionValue'],
				['assigner', sel_TaskAssigner, 'selectedOptionValue'],
				['assignee', sel_TaskAssignee, 'selectedOptionValue'],
				['description', inp_TaskComment]
			].forEach(([key, widget, valueKey]) => addIfDirty(data, key, widget, valueKey));

			// Always update
			data.editor_id = editorId;

			const body = {
				keys: [taskId],
				data
			};

			const params = { collection: "tasks",	body: body };
			showAlert('Обновляем задачу...', 'info');
			// 1. Update main task
			await items.updateItems(params);

			// 2. Upload files if any
			if (fp_taskFiles.files?.length > 0) {
				await files.uploadFiles({filepicker: fp_taskFiles, taskId: taskId});
			}

			// 3. Prepare updates for auditors and participants
			const updates = [];

			updates.push(...this.processRelationUpdate(sel_TaskAuditors, taskId, appsmith.store.curAuditorsIds || [], "tasks_auditors"));
			updates.push(...this.processRelationUpdate(sel_TaskParticipants, taskId, appsmith.store.curParticipantsIds || [], "tasks_participants"));

			if (updates.length) await Promise.all(updates);

			// 4. Refresh tasks and update UI
			// below we use 'withNewTasks', becase tasks.getTasks() do not contain
			// our new task... because of async ?!?
			const withNewTasks = await this.getTasks();
			await tbl_tasks.setData(withNewTasks);

			// Select updated row and update selection
			const index = withNewTasks.findIndex(row => row.id === taskId);
			await tbl_tasks.setSelectedRowIndex(index);

			if (index >= 0) {
				await this.setSelectedTask(withNewTasks[index]);
				await this.tbs_task_onTabSelected();
			}

			closeModal(mdl_addEditTask.name);
			// await audit.addAuditAction({action: 'task_edit', taskId: taskId});
			await storeValue("curAuditorsIds", undefined, true);
			await storeValue("curParticipantsIds", undefined, true);
			showAlert('Задача обновлена!', 'success');
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error in task updating:", error);
			showAlert("Ошибка при обновлении задачи", "error");
			throw error;
		}
	},

	async saveSelectedTask(){
		const savedTaskID = appsmith.store.savedTaskID;
		if (savedTaskID) {
			showAlert('There is saved task ID: ' + savedTaskID, 'error');
		}
		const selectedTaskId = appsmith.store.selectedTask?.id;
		if (selectedTaskId) {
			await storeValue("savedTaskID", selectedTaskId, true);
			await removeValue("selectedTask");
		} else {
			showAlert('There is NO selected task ID', 'error');
		}
	},


	async restoreSavedTaskSelection() {
		const id = appsmith.store.savedTaskID;
		if (!id) return;

		let retries = 10;
		while ((!tbl_tasks.tableData || tbl_tasks.tableData.length === 0) && retries > 0) {
			console.log("Waiting for tbl_tasks.tableData to load...");
			await new Promise(r => setTimeout(r, 300));
			retries--;
		}

		const displayRows = tbl_tasks.tableData || [];
		const index = displayRows.findIndex(row => row.id === id);

		if (index === -1) {
			console.warn(`Task with ID ${id} not found in table`);
			return;
		}

		const sourceTask = this.getSourceTaskById(id);
		if (!sourceTask) {
			console.warn(`Source task ${id} not found`);
			return;
		}

		await tbl_tasks.setSelectedRowIndex(index);
		await this.setSelectedTask(sourceTask);
		await this.tbs_task_onTabSelected();
	},


	async tbs_task_onTabSelected(){
		// if task is selected and...
		if (appsmith.store?.selectedTask){
			const taskId = appsmith.store.selectedTask.id;
			switch (tbs_task.selectedTab){
					// ...we are on comments tab
				case "Комментарии":
					await comments.getTaskComments(taskId);
					break;
					// ...we are on files tab
				case "Логи":
					await audit.getTaskLog(taskId);
					break;
					// ...we are on files tab
				case "Файлы":
					console.log("taskId: ", taskId);
					await files.getTaskFiles(taskId);
					break;
				default:
					break;
			}
		} else {
			return
		}
	},

	async updateTaskList() {
		// tasks.savedTask = tasks.selectedItem;		// keeping last selectedItem for restoring last state if we cancel adding task
		const data = await this.getTasks();
		// vvs 2do: check if we need next line
		await tbl_tasks.setData(data);

		// tasks.setSelectedTask(tasks.savedTask); // restore saved task before updating
		// tasks.savedTask = undefined;
	},


	// Mark task as read
	async btn_markRead_onClick(){
		const selectedTaskId = tbl_tasks.selectedRow?.id;
		const unreadInfo = tbl_tasks.selectedRow?.unreadInfo;

		if (!unreadInfo?.id) {
			console.warn("No unreadInfo found for the selected row.");
			return;
		}

		try {
			await items.deleteItems({
				collection: "unread",
				body: {
					query: {
						filter: { id: { _eq: unreadInfo.id } }
					}
				}
			});

			await this.updateTaskList();

			const displayRows = tbl_tasks.tableData || [];
			const index = displayRows.findIndex(row => row.id === selectedTaskId);
			const sourceTask = this.getSourceTaskById(selectedTaskId);

			if (index >= 0 && sourceTask) {
				await tbl_tasks.setSelectedRowIndex(index);
				await this.setSelectedTask(sourceTask);
				await this.tbs_task_onTabSelected();
			} else {
				await removeValue("selectedTask");
			}
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error deleting unread record:", error);
		}
	},

	async btn_openAddTask_onClick(){
		await this.saveSelectedTask();
		await removeValue("selectedTask");
		showModal(mdl_addEditTask.name);
	},

	async btn_openEditTask_onClick(){
		const task = appsmith.store.selectedTask;
		if (!task?.id) {
			showAlert('Редактирование задачи, в то время как она не выбрана...', 'success');
			return;
		}

		await utils.getStatusesOfProcess();
		await storeValue("curAuditorsIds", task.auditor_ids?.map(i => i.directus_users_id.id), true);
		await storeValue("curParticipantsIds", task.participant_ids?.map(i => i.directus_users_id.id), true);
		showModal(mdl_addEditTask.name);
	},

	async btn_closeAddEditTaskModal_onClick() {
		// restore focus on last task if editing was cancelled
		await this.restoreSavedTaskSelection();
		await storeValue("curAuditorsIds", undefined, true);
		await storeValue("curParticipantsIds", undefined, true);
		closeModal(mdl_addEditTask.name);
	}
} 