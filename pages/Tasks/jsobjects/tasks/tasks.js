export default {
	// Tasks' js object
	setSelectedTask(task){
		storeValue("selectedTask", task, true);
		removeValue("savedTaskID");
	},

	async tbl_tasks_onRowSelected(){
		const row = tbl_tasks.selectedRow;
		if (!row?.id) {
			return;
		}
		this.setSelectedTask(tasks.getTasks.data[tbl_tasks.selectedRowIndex]);
		await this.tbs_task_onTabSelected();
		await audit.addAuditAction({action: 'task_view', taskId: row.id});
	},

	async initTasks(){
		const user = appsmith.store?.user;

		// если операция восстановления ещё не завершена — просто не уходить на Auth
		// если user уже проверен и его нет — уходить
		if (!user || !user.token) {
			if (appsmith.user.email === 'vvs@osagent.ru') {
				showAlert('DEV bypass: normal user go to auth page, while vvs@osagent.ru stays here', 'warning');
			} else {
				showAlert('Требуется авторизация. Перенаправление на страницу входа.', 'info');
				navigateTo("Auth");
			}
			return;
		}

		try {
			const tasksData = await this.getTasks();
			// Only call tab selection if a task exists
			if (tasksData.length > 0 ) {
				console.log("tasksData[0]:", tasksData[0]);
				this.setSelectedTask(tasksData[0]);
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
			console.error("Error loading tasks:", error);
		}
	},

		/// ================== test block ==================

	async Test(){
	// const task = appsmith.store.selectedTask;
	console.log("this.curAuditorsIds: ", appsmith.store.user);
	},
	/// ============== end of test block ===============

	
	async addTask(){
		try {
			const body = {
				project_id: sel_TaskProject.selectedOptionValue,
				title: inp_TaskTitle.text,
				deadline: dat_TaskDeadline.selectedDate,
				task_priority_id: sel_TaskPriority.selectedOptionValue,
				status_id: sel_TaskStatus.selectedOptionValue,
				process_id: sel_TaskProcess.selectedOptionValue,
				assigner: sel_TaskAssigner.selectedOptionValue,
				assignee: sel_TaskAssignee.selectedOptionValue,
				description: inp_TaskComment.text,
				author_id: appsmith.store.user.id
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
			const processRelation = (widget, collection) => {
				if (!widget.isDirty) return;
				const userIds = widget.selectedOptionValues;
				if (userIds.length === 0) return;
				updates.push(
					items.createItems({
						body: userIds.map(userId => ({ tasks_id: taskId, directus_users_id: userId })),
						collection
					})
				);
			};

			processRelation(sel_TaskAuditors, "tasks_auditors");
			processRelation(sel_TaskParticipants, "tasks_participants");
			if (updates.length > 0) await Promise.all(updates);

			// 4. Refresh tasks (triggers table reactivity)
			// below we use 'withNewTasks', becase tasks.getTasks() do not contain
			// our new task... because of async ?!?
			const withNewTasks = await this.getTasks();
			await tbl_tasks.setData(withNewTasks);

			// 5. Select the new row after data refresh
			const index = tbl_tasks.tableData.findIndex(row => row.id === taskId);
			await tbl_tasks.setSelectedRowIndex(index);
			this.setSelectedTask(tbl_tasks.tableData[index]);
			await removeValue("savedTaskID");

			// 6. Finalize
			await audit.addAuditAction({action: 'task_added', taskId: taskId});

			showAlert('Задача создана!', 'success');
			closeModal(mdl_addEditTask.name);
		} catch (error) {
			console.error("Error in task processing:", error);
			showAlert('Ошибка при создании задачи', 'error');
			throw error;
		}
	},

	async updateTask(){
		try {
			// tasks.selectedItem.id;
			const taskId = appsmith.store.selectedTask.id;

			// Helper to add only dirty fields
			const addIfDirty = (obj, key, widget, valueKey = 'text') => {
				if (widget.isDirty) obj[key] = widget[valueKey];
			};

			// Build update body with only changed fields
			const data = {};
			[
				['project_id', sel_TaskProject, 'selectedOptionValue'],
				['title', inp_TaskTitle],
				['deadline', dat_TaskDeadline, 'selectedDate'],
				['task_priority_id', sel_TaskPriority, 'selectedOptionValue'],
				['status_id', sel_TaskStatus, 'selectedOptionValue'],
				['process_id', sel_TaskProcess, 'selectedOptionValue'],
				['assigner', sel_TaskAssigner, 'selectedOptionValue'],
				['assignee', sel_TaskAssignee, 'selectedOptionValue'],
				['description', inp_TaskComment]
			].forEach(([key, widget, valueKey]) => addIfDirty(data, key, widget, valueKey));

			// Always update
			data.editor_id = appsmith.store.user.id;
			
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

			// Helper for relation updates
			const processRelation = (widget, curIds, collection) => {
				if (!widget.isDirty) return;
				const newIds = widget.selectedOptionValues;
				const toAdd = newIds.filter(id => !curIds.includes(id));
				const toRemove = curIds.filter(id => !newIds.includes(id));
				if (toAdd.length) {
					updates.push(
						items.createItems({
							body: toAdd.map(userId => ({ tasks_id: taskId, directus_users_id: userId })),
							collection
						})
					);
				}
				if (toRemove.length) {
					updates.push(
						items.deleteItems({
							collection,
							body: {
								query: {
									filter: {
										tasks_id: { "_eq": taskId },
										directus_users_id: { "_in": toRemove }
									}
								}
							}
						})
					);
				}
			};

			processRelation(sel_TaskAuditors, appsmith.store.curAuditorsIds || [], "tasks_auditors");
			processRelation(sel_TaskParticipants, appsmith.store.curParticipantsIds || [], "tasks_participants");

			if (updates.length) await Promise.all(updates);

			// 4. Refresh tasks and update UI
			// below we use 'withNewTasks', becase tasks.getTasks() do not contain
			// our new task... because of async ?!?
			const withNewTasks = await this.getTasks();
			await tbl_tasks.setData(withNewTasks);

			// Select updated row and update selection
			const index = tbl_tasks.tableData.findIndex(row => row.id === taskId);
			await tbl_tasks.setSelectedRowIndex(index);
			// tasks.selectedItem = tbl_tasks.tableData[index];
			this.setSelectedTask(tbl_tasks.tableData[index])
			this.tbs_task_onTabSelected();
			closeModal(mdl_addEditTask.name);
			await audit.addAuditAction({action: 'task_edit', taskId: taskId});
			await storeValue("curAuditorsIds", undefined, true);
			await storeValue("curParticipantsIds", undefined, true);
			showAlert('Задача обновлена!', 'success');
		} catch (error) {
			console.error("Error in task updating:", error);
			showAlert('Ошибка при обновлении задачи', 'error');
			throw error;
		}
	},

	saveSelectedTask(){
		const savedTaskID = appsmith.store.savedTaskID;
		if (savedTaskID) {
			showAlert('There is saved task ID: ' + savedTaskID, 'error');
		}
		const selectedTaskId = appsmith.store.selectedTask?.id;
		if (selectedTaskId) {
			storeValue("savedTaskID", selectedTaskId, true);
			removeValue("selectedTask");
		} else {
			showAlert('There is NO selected task ID', 'error');
		}
	},


	async restoreSavedTaskSelection() {
		const id = appsmith.store.savedTaskID;
		if (!id) return;

		// Wait until table data is available
		let retries = 10;
		while ((!tbl_tasks.tableData || tbl_tasks.tableData.length === 0) && retries > 0) {
			console.log("Waiting for tbl_tasks.tableData to load...");
			await new Promise(r => setTimeout(r, 300)); // wait 300 ms
			retries--;
		}

		const tableData = tbl_tasks.tableData || [];
		const index = tableData.findIndex(row => row.id === id);

		if (index === -1) {
			console.warn(`Task with ID ${id} not found in table`);
			return;
		}

		await tbl_tasks.setSelectedRowIndex(index);
		this.setSelectedTask(tableData[index]);
		await removeValue("savedTaskID");
	},

	async getTasks(){
		// Determine user ID: substitute or logged-in user
		const userid = (sel_chooseEmployee.selectedOptionValue && !sel_chooseEmployee.isDisabled) ? sel_chooseEmployee.selectedOptionValue
		: appsmith.store.user.id;
		let allTasks = [];
		try {
			// Prepare filter for tasks (assigner, assignee, auditor, participant)
			const orConditions = [
				{ assigner: { _eq: userid } },
				{ assignee: { _eq: userid } },
				{ auditor_ids: {directus_users_id: { _eq: userid } } },
				{ participant_ids: {directus_users_id: { _eq: userid } } }
			];

			const filter = { _or: orConditions };
			// Fields to fetch
			const fields = [
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
			].join(",");

			const params = {
				fields: fields,
				collection: "tasks",
				filter: filter
			};
			const response = await items.getItems(params);

			// Fetch all tasks for user
			// const response = await qGetTasks.run({ 
			// filter: JSON.stringify(filterObj),
			// fields
			// });
			allTasks = response.data || [];
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}

		// Filter incomplete tasks if needed
		// Previous vartiant whith task.is_complete field
		//const filteredTasks = chk_withCompleted.isChecked	? allTasks : allTasks.filter(task => !task.is_complete);
		//Actual variant with status name
		const filteredTasks = chk_withCompleted.isChecked ?	allTasks : allTasks.filter(task => task.status_id?.name !== "Завершена")
		let unreadTasks = [];

		try {
			// Prepare and fetch unread tasks
			const filter = { user_id: { _eq: userid } };
			const fields = "*";
			const params = {
				fields: fields,
				collection: "unread",
				filter: filter
			};
			const response = await items.getItems(params);
			unreadTasks = response.data || [];
		} catch (error) {
			console.error("Error fetching unread tasks:", error);
			throw error;
		}

		// Map for quick unread lookup
		const unreadMap = new Map(unreadTasks.map(unread => [unread.task_id, unread]));

		// Combine tasks with unread info
		let combinedTasks = filteredTasks.map(task => ({
			...task,
			unread: unreadMap.has(task.id),
			unreadInfo: unreadMap.get(task.id) || null
		}));

		// Sort by id (ascending)
		combinedTasks.sort((a, b) => a.id - b.id);
		if (combinedTasks.length === 0) {
			combinedTasks = [
				{
					"id": 99999,
					"title": "Cоздайте первую задачу",
					"description": "",
					"deadline": "",
					"status_id": {
						"id": 2,
						"name": "Новая"
					},
					"process_id": {
						"id": 1,
						"name": "Задача"
					},
					"assigner": {},
					"assignee": {},
					"project_id": {
						"name": "ИТ",
						"id": 3
					},
					"auditor_ids": [],
					"participant_ids": [],
					"files_id": [],
					"unread": false,
					"unreadInfo": null
				}
			];
		}
		return combinedTasks;
	},

	async tbs_task_onTabSelected(){
		// if task is selected and...
		if (appsmith.store.selectedTask){
			const taskId = appsmith.store.selectedTask.id;
			switch (tbs_task.selectedTab){
					// ...we are on comments tab
				case "Комментарии":
					comments.getTaskComments(taskId);
					break;
					// ...we are on files tab
				case "Логи":
					audit.getTaskLog(taskId);
					break;
					// ...we are on files tab
				case "Файлы":
					console.log("taskId: ", taskId);
					files.getTaskFiles(taskId);
					break;
				default:
					break;
			}
			// utils.addAuditAction.data("task_view",tbl_tasks.selectedRow.id);
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
	async sw_unreadTask_onChange(){
		const unreadInfo = tbl_tasks.selectedRow?.unreadInfo;
		if (!unreadInfo || !unreadInfo.id) {
			console.warn("No unreadInfo found for the selected row.");
			return;
		}
		const unread_id = unreadInfo.id;

		try {
			await items.deleteItems({
				collection: "unread",
				body: {
					query: {
						filter: { id: { _eq: unread_id } }
					}
				}
			});
			console.log("Deleted unread record with ID:", unread_id);
			// Optionally disable the switch if needed:
			// sw_unreadTask.setDisabled(true);
			const data = await this.getTasks();
			await tbl_tasks.setData(data);
		} catch (error) {
			console.error("Error deleting unread record:", error);
			// Optionally, show an alert or handle the error further here
		}
	},

	btn_openAddTask_onClick(){
		this.saveSelectedTask();		// keeping last selectedItem for restoring last state if we cancel adding task
		removeValue("selectedTask");

		showModal(mdl_addEditTask.name);
	},

	btn_openEditTask_onClick(){
		// save auditors and participants
		// vvs 2do: check it later
		const task = appsmith.store.selectedTask;
		if (!task?.id)
		{
			showAlert('Редактирование задачи, в то время как она не выбрана...', 'success');
			return
		}
		utils.getStatusesOfProcess();

		// current Auditors ids
		storeValue("curAuditorsIds", task.auditor_ids.map(i => i.directus_users_id.id), true); 
		// current Participants ids
		storeValue("curParticipantsIds", task.participant_ids.map(i => i.directus_users_id.id), true);
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