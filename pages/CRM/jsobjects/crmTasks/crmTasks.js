export default {
  selectedTask: undefined,

  async setSelectedTask(task) {
    const nextTask = task?.id ? task : null;
    crmTasks.selectedTask = nextTask;

    if (nextTask) {
      await storeValue("selectedCrmTask", nextTask, true);
    } else {
      await removeValue("selectedCrmTask");
    }
  },

  async setTaskRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    await storeValue("crmTaskRows", safeRows, false);
    return safeRows;
  },

  getTaskRows() {
    return Array.isArray(appsmith.store?.crmTaskRows) ? appsmith.store.crmTaskRows : [];
  },

  getSelectedTask() {
    return appsmith.store?.selectedCrmTask || crmTasks.selectedTask || null;
  },

  getSourceTaskById(taskId, fallbackRows = []) {
    const rows = crmTasks.getTaskRows().length ? crmTasks.getTaskRows() : fallbackRows;
    return rows.find((row) => row.id === taskId) || null;
  },

  async tbs_task_onTabSelected() {
    return crmTasks.getSelectedTask();
  },

  initCRMTasks: async () => {
    const user = appsmith.store?.user;
    const isEditMode = appsmith.mode === "EDIT";
    const hasCrmAccess = (appsmith.store?.appPageCodes || []).includes("crm");

    if (!user?.token) {
      if (isEditMode) {
        showAlert("EDIT: нет токена пользователя, остаёмся на странице CRM без загрузки данных.", "warning");
      } else {
        showAlert("Требуется авторизация. Перенаправление на страницу входа.", "info");
        navigateTo("Auth");
      }
      return;
    }

    if (!hasCrmAccess) {
      showAlert("Нет доступа к странице CRM.", "warning");
      if (!isEditMode) {
        navigateTo("Auth");
        return;
      }
    }

    try {
      await items.ensureFreshToken();

      const tasksData = await crmTasks.getCRMTasks();
      await crmTasks.setTaskRows(tasksData);

      if (tasksData.length > 0) {
        await crmTasks.setSelectedTask(tasksData[0]);
        await crmTasks.tbs_task_onTabSelected();
      } else {
        await crmTasks.setSelectedTask(null);
      }

      await utils.GetUsersOfficeTerms();
    } catch (error) {
      if (error?.authHandled) return;
      console.error("Error loading CRM tasks:", error);
    }
  },

  getClientTasks: async () => {
    return [];
  },

  getCRMTasks: async () => {
    const userid = (sel_chooseEmployee.selectedOptionValue && !sel_chooseEmployee.isDisabled)
      ? sel_chooseEmployee.selectedOptionValue
      : appsmith.store?.user?.id;

    if (!userid) throw new Error("user id missing");

    try {
      const tasksResponse = await items.getItems({
        collection: "crm_tasks",
        fields: [
          "id",
          "title",
          "description",
          "deadline",
          "is_complete",
          "client_id.id",
          "client_id.name",
          "assigner_id.id",
          "assigner_id.last_name",
          "assigner_id.first_name",
          "assignee_id.id",
          "assignee_id.last_name",
          "assignee_id.first_name"
        ].join(","),
        filter: {
          _or: [
            { assigner_id: { _eq: userid } },
            { assignee_id: { _eq: userid } }
          ]
        },
        limit: -1
      });

      const allTasks = Array.isArray(tasksResponse.data) ? tasksResponse.data : [];
      const filteredTasks = chk_withCompleted.isChecked
        ? allTasks
        : allTasks.filter((task) => !task.is_complete);

      let unreadRows = [];
      const taskIds = filteredTasks.map((task) => task.id);

      if (taskIds.length > 0) {
        const unreadResponse = await items.getItems({
          collection: "crm_unread",
          fields: "id,crm_task_id,user_id",
          filter: {
            user_id: { _eq: userid },
            crm_task_id: { _in: taskIds }
          },
          limit: -1
        });

        unreadRows = Array.isArray(unreadResponse.data) ? unreadResponse.data : [];
      }

      const unreadMap = new Map(
        unreadRows.map((row) => [
          typeof row.crm_task_id === "object" ? row.crm_task_id.id : row.crm_task_id,
          row
        ])
      );

      const combinedTasks = filteredTasks.map((task) => {
        const unreadRecord = unreadMap.get(task.id);
        return {
          ...task,
          unread: Boolean(unreadRecord),
          unreadInfo: unreadRecord || null
        };
      });

      combinedTasks.sort((a, b) => a.id - b.id);
      return combinedTasks;
    } catch (error) {
      if (error?.authHandled) throw error;
      console.error("Error in CRM task processing:", error);
      throw error;
    }
  },

  async updateTaskList({ keepSelection = true } = {}) {
    const selectedTaskId = keepSelection ? crmTasks.getSelectedTask()?.id : null;
    const rows = await crmTasks.getCRMTasks();

    await crmTasks.setTaskRows(rows);

    if (!selectedTaskId) {
      await crmTasks.setSelectedTask(rows[0] || null);
      return rows;
    }

    const nextSelected = rows.find((row) => row.id === selectedTaskId) || rows[0] || null;
    await crmTasks.setSelectedTask(nextSelected);
    return rows;
  },

  async btn_markRead_onClick() {
    const selectedTask = crmTasks.getSelectedTask();
    const unreadInfo = selectedTask?.unreadInfo;

    if (!unreadInfo?.id) return;

    await items.deleteItems({
      collection: "crm_unread",
      body: {
        query: {
          filter: { id: { _eq: unreadInfo.id } }
        }
      }
    });

    await crmTasks.updateTaskList();
  }
}