export default {
	positionsRefreshPromise: null,
	employeesRefreshPromise: null,
	/// ================== test block ==================
	// async test(){
	// console.log(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
	// },
	/// ============== end of test block ===============
	normalizeTableRow(row) {
		return { ...(row?.allFields || row || {}), ...(row?.updatedFields || {}) };
	},

	getSelectedPositionRowIndex() {
		const rows = tbl_positions.tableData || [];
		const selectedId = appsmith.store?.hrSelectedPosition?.id;
		if (!selectedId) return -1;

		return rows.findIndex((row) => String(row.id) === String(selectedId));
	},

	getFilteredEmployeeRows() {
		const rows = Array.isArray(appsmith.store?.hrEmployeeRows) ? appsmith.store.hrEmployeeRows : [];
		const branchId = sel_chooseBranchEmployee.selectedOptionValue || "";
		if (!branchId) return rows;
		return rows.filter((row) => (row.branch_ids || []).some((id) => String(id) === String(branchId)));
	},

	getSelectedEmployeeRowIndex() {
		const rows = tbl_employees.tableData || [];
		const selectedUserId = appsmith.store?.hrSelectedEmployeeRow?.user_id;
		if (!selectedUserId) return -1;

		return rows.findIndex((row) => String(row.user_id) === String(selectedUserId));
	},

	async openEmployeeModal(mode = "add", row = null) {
		const isEdit = mode === "edit";
		const sourceRow = row || (isEdit ? (tbl_employees.triggeredRow || tbl_employees.selectedRow) : null);

		if (isEdit && !sourceRow?.user_id) {
			showAlert("Сотрудник не выбран", "warning");
			return;
		}

		const employee = isEdit ? {
			id: sourceRow.user_id,
			employee: sourceRow.employee || "",
			first_name: sourceRow.first_name || "",
			last_name: sourceRow.last_name || "",
			middle_name: sourceRow.middle_name || "",
			email: sourceRow.email || "",
			role: sourceRow.role || "",
			policies: sourceRow.policies || [],
			policy_links: sourceRow.policy_links || []
		} : null;

		await utils.getSupervisorPositionOptions();
		await storeValue("hrEmployeeModalMode", isEdit ? "edit" : "add", true);
		await storeValue("hrSelectedEmployee", employee, true);

		resetWidget("cnt_employee_profile", true);
		showModal(mdl_addEditEmployee.name);
	},

	async tbl_positions_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_positions.selectedRow;

		if (!row?.id) {
			await storeValue("hrSelectedPosition", null, true);
			await storeValue("hrOfficeTermHistoryMode", "position", true);
			await storeValue("hrOfficeTermHistoryRows", [], false);
			return;
		}

		await storeValue("hrSelectedPosition", row, true);
		await storeValue("hrOfficeTermHistoryMode", "position", true);
		await utils.getOfficeTermHistory({ positionId: row.id });
	},

	async tbl_employees_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_employees.selectedRow;

		if (!row?.user_id) {
			await storeValue("hrSelectedEmployeeRow", null, true);
			await storeValue("hrOfficeTermHistoryRows", [], false);
			return;
		}

		await storeValue("hrSelectedEmployeeRow", row, true);
		await storeValue("hrOfficeTermHistoryMode", "employee", true);
		await utils.getOfficeTermHistory({ userId: row.user_id });
	},

	async sel_chooseBranch_OptionChanged(branchIdParam) {
		const branchId = branchIdParam ?? sel_chooseBranch.selectedOptionValue ?? "";
		const previousBranchId = appsmith.store?.hrSelectedBranchId || "";

		if (String(branchId) === String(previousBranchId)) return;

		await this.refreshHrBranch(branchId, { keepSelection: false });
	},

	async refreshHrBranch(branchId, { keepSelection = true } = {}) {
		const branchIdValue = branchId ?? "";
		await storeValue("hrSelectedBranchId", branchIdValue, true);

		const previousPositionId = appsmith.store?.hrSelectedPosition?.id;
		const rows = await utils.getPositionsByBranch();
		const selectedPosition =
					keepSelection && previousPositionId
		? (rows.find((row) => String(row.id) === String(previousPositionId)) || rows[0] || null)
		: (rows[0] || null);

		await storeValue("hrSelectedPosition", selectedPosition, true);

		if (selectedPosition?.id) {
			await storeValue("hrOfficeTermHistoryMode", "position", true);
			await utils.getOfficeTermHistory({ positionId: selectedPosition.id });
		} else {
			await storeValue("hrOfficeTermHistoryRows", [], false);
		}

		return rows;
	},

	async refreshPositionsPage({ notify = true } = {}) {
		if (this.positionsRefreshPromise) return await this.positionsRefreshPromise;

		this.positionsRefreshPromise = (async () => {
			await storeValue("hrPositionsRefreshing", true, false);
			try {
				await utils.loadDictionaries();
				await utils.getCurrentOfficeTerms();

				const branchId = sel_chooseBranch.selectedOptionValue ?? appsmith.store?.hrSelectedBranchId ?? "";
				await this.refreshHrBranch(branchId);

				if (notify) showAlert("Должности обновлены", "success");
			} finally {
				await storeValue("hrPositionsRefreshing", false, false);
				this.positionsRefreshPromise = null;
			}
		})();

		return await this.positionsRefreshPromise;
	},

	async refreshEmployeesPage({ notify = true } = {}) {
		if (this.employeesRefreshPromise) return await this.employeesRefreshPromise;

		this.employeesRefreshPromise = (async () => {
			await storeValue("hrEmployeesRefreshing", true, false);
			try {
				await utils.getCurrentOfficeTerms();
				await utils.getEmployees();

				if (notify) showAlert("Сотрудники обновлены", "success");
			} finally {
				await storeValue("hrEmployeesRefreshing", false, false);
				this.employeesRefreshPromise = null;
			}
		})();

		return await this.employeesRefreshPromise;
	},

	async initHR(){
		const user = appsmith.store?.user;
		const isEditMode = appsmith.mode === "EDIT";
		const hasHrAccess = await nav.hasPage("hr");

		if (!user?.token) {
			if (isEditMode) {
				showAlert("EDIT: нет токена пользователя, остаёмся на странице HR без загрузки данных.", "warning");
			} else {
				showAlert("Требуется авторизация. Перенаправление на страницу входа.", "info");
				navigateTo("Auth");
			}
			return;
		}

		if (!hasHrAccess) {
			showAlert("Нет доступа к странице HR.", "warning");

			if (!isEditMode) {
				navigateTo("Auth");
				return;
			}
		}

		// Only select positions if any exist
		try {
			await items.ensureFreshToken();
			await utils.loadDictionaries();

			await utils.getCurrentOfficeTerms();
			const selectedBranchId = appsmith.store?.hrSelectedBranchId ?? "";

			await this.refreshHrBranch(selectedBranchId, { keepSelection: false });
			await utils.getEmployees();

			return;
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading office terms:", error);
		}
	},

	async btn_closeAddEditEmployeeModal_onClick() {
		// restore focus on last employee if editing was cancelled
		//await this.restoreSavedTaskSelection();
		// await storeValue("curAuditorsIds", undefined, true);
		// await storeValue("curParticipantsIds", undefined, true);
		closeModal(mdl_addEditEmployee.name);
	},

	normalizeSelectedIds(values = []) {
		return [...new Set((Array.isArray(values) ? values : [])
											 .map((value) => String(value || "").trim())
											 .filter(Boolean))];
	},

	buildPoliciesPayload(userId, selectedPolicyIds = [], existingPolicyLinks = []) {
		const selectedIds = this.normalizeSelectedIds(selectedPolicyIds);
		const existingLinks = (Array.isArray(existingPolicyLinks) ? existingPolicyLinks : [])
		.map((item) => ({
			id: item?.id || null,
			policy_id: String(item?.policy_id || "").trim()
		}))
		.filter((item) => item.policy_id);

		const existingIds = existingLinks.map((item) => item.policy_id);

		return {
			create: selectedIds
			.filter((policyId) => !existingIds.includes(policyId))
			.map((policyId) => ({
				user: userId,
				policy: { id: policyId }
			})),
			update: [],
			delete: existingLinks
			.filter((item) => !selectedIds.includes(item.policy_id) && item.id)
			.map((item) => item.id)
		};
	},

	getEmployeeFormData({ isNew = false } = {}) {
		const email = inp_email.text?.trim();
		const password = inp_password.text?.trim();
		const role = sel_role.selectedOptionValue;
		const policyIds = this.normalizeSelectedIds(msel_policies.selectedOptionValues);

		const body = {
			first_name: inp_first_name.text?.trim() || "",
			last_name: inp_last_name.text?.trim() || "",
			middle_name: inp_middle_name.text?.trim() || ""
		};

		if (isNew) body.status = "active";
		if (!isNew) {
			const selectedEmployee = appsmith.store?.hrSelectedEmployee;
			body.policies = this.buildPoliciesPayload(
				selectedEmployee?.id,
				policyIds,
				selectedEmployee?.policy_links || []
			);
		}
		if (email) body.email = email;
		if (password) body.password = password;
		if (role) body.role = role;

		return { body, policyIds };
	},

	async saveEmployee() {
		const mode = appsmith.store?.hrEmployeeModalMode || "add";
		const selectedEmployee = appsmith.store?.hrSelectedEmployee;
		const { body, policyIds } = this.getEmployeeFormData({ isNew: mode === "add" });
		const positionId = sel_position4empl.selectedOptionValue || null;
		const assignmentStartDate = this.formatDateValue(dp_startDatePos2Empl.selectedDate);

		if (!body.last_name || !body.first_name) {
			showAlert("Заполните фамилию и имя", "warning");
			return;
		}

		if (mode === "add" && positionId && !assignmentStartDate) {
			showAlert("Укажите дату назначения на должность", "warning");
			return;
		}

		if (mode === "add" && positionId) {
			try {
				await this.validatePositionAvailableForAssignment({
					position_id: positionId,
					date_from: assignmentStartDate
				});
			} catch (error) {
				showAlert(error?.message || "Ошибка проверки должности", "warning");
				return;
			}
		}

		let assignmentCreated = false;

		if (mode === "edit") {
			await items.updateUser(selectedEmployee.id, body);
		} else {
			const createdUser = await items.createUser(body);
			const createdUserId = this.getCreatedRecordId(createdUser);

			if (positionId) {
				await this.createOfficeTermAssignment({
					user_id: createdUserId,
					position_id: positionId,
					date_from: assignmentStartDate
				});
				assignmentCreated = true;
			}
		}

		showAlert(
			assignmentCreated ? "Сотрудник добавлен и назначен на должность" : (mode === "edit" ? "Сотрудник обновлен" : "Сотрудник добавлен"),
			"success"
		);
		closeModal(mdl_addEditEmployee.name);
		await Promise.all([
			this.refreshEmployeesPage({ notify: false }),
			this.refreshPositionsPage({ notify: false })
		]);
	},

	async savePositionTitleRow(rowParam = null) {
		const rawRow = rowParam || (tbl_position_titles.isAddRowInProgress ? tbl_position_titles.newRow : (tbl_position_titles.updatedRows?.[0] || tbl_position_titles.updatedRow || tbl_position_titles.selectedRow));
		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const body = { title: row?.title?.trim?.() || "" };
		if (!body.title) return showAlert("Укажите название должности", "warning");

		if (tbl_position_titles.isAddRowInProgress) await items.createItems({ collection: "position_titles", body });
		else await items.updateItems({ collection: "position_titles", body: { keys: [row.id], data: body } });

		await utils.getPositionTitleRows();
		showAlert("Название должности сохранено", "success");
	},

	async saveCityRow(rowParam = null) {
		const rawRow =
					rowParam ||
					(tbl_cities.isAddRowInProgress
					 ? tbl_cities.newRow
					 : (tbl_cities.updatedRows?.[0] || tbl_cities.updatedRow || tbl_cities.selectedRow));

		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const name = row?.name?.trim?.() || "";
		const body = { name };

		if (!body.name) return showAlert("Укажите город", "warning");

		if (tbl_cities.isAddRowInProgress) {
			await items.createItems({ collection: "cities", body });
		} else {
			await items.updateItems({ collection: "cities", body: { keys: [row.id], data: body } });
		}

		await Promise.all([
			utils.getCityRows(),
			utils.getBranches()
		]);
		showAlert("Город сохранен", "success");
	},

	async saveBranchRow(rowParam = null) {
		const rawRow = rowParam || (tbl_branches.isAddRowInProgress ? tbl_branches.newRow : (tbl_branches.updatedRows?.[0] || tbl_branches.updatedRow || tbl_branches.selectedRow));
		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const body = {
			name: row?.name?.trim?.() || "",
			city_id: row?.city_id || null
		};
		if (!body.name) return showAlert("Укажите подразделение", "warning");

		if (tbl_branches.isAddRowInProgress) await items.createItems({ collection: "branches", body });
		else await items.updateItems({ collection: "branches", body: { keys: [row.id], data: body } });

		await utils.getBranches();
		showAlert("Подразделение сохранено", "success");
	},

	async openPositionModal(mode = "add", row = null) {
		const isEdit = mode === "edit";
		const sourceRow = row || (isEdit ? (tbl_positions.triggeredRow || tbl_positions.selectedRow) : null);

		if (isEdit && !sourceRow?.id) {
			showAlert("Должность не выбрана", "warning");
			return;
		}

		const position = isEdit ? {
			id: sourceRow.id,
			position_title_id: sourceRow.position_title_id || null,
			branch_id: sourceRow.branch_id || appsmith.store?.hrSelectedBranchId || null,
			supervisor_position_id: sourceRow.supervisor_position_id || null,
			title: sourceRow.title || "",
			comment: sourceRow.comment || ""
		} : {
			branch_id: appsmith.store?.hrSelectedBranchId || null
		};

		await utils.getSupervisorPositionOptions();
		await storeValue("hrPositionModalMode", isEdit ? "edit" : "add", true);
		await storeValue("hrSelectedPositionDraft", position, true);

		resetWidget("mdl_addEditPosition", true);
		showModal(mdl_addEditPosition.name);
	},

	closePositionModal() {
		closeModal(mdl_addEditPosition.name);
	},

	getCreatedRecordId(response) {
		return response?.data?.id || response?.id || null;
	},

	formatDateValue(value) {
		return value ? moment(value).format("YYYY-MM-DD") : null;
	},

	async createOfficeTermAssignment({ user_id, position_id, date_from, comment = "" } = {}) {
		const body = {
			user_id,
			position_id,
			date_from: this.formatDateValue(date_from),
			date_till: null,
			comment
		};

		await this.validateOfficeTermPeriod({ id: null, ...body });
		return await items.createItems({ collection: "office_terms", body });
	},

	async validatePositionAvailableForAssignment({ position_id, date_from, date_till = null } = {}) {
		if (!position_id) throw new Error("Выберите должность");
		if (!date_from) throw new Error("Укажите дату начала");

		const response = await items.getItems({
			collection: "office_terms",
			fields: "id,position_id.id,date_from,date_till",
			filter: { position_id: { id: { _eq: position_id } } },
			limit: -1
		});

		for (const term of (response.data || [])) {
			if (this.datesOverlap(date_from, date_till, term.date_from, term.date_till)) {
				throw new Error("Должность уже занята другим сотрудником в указанный период");
			}
		}
	},

	getPositionFormData() {
		const body = {
			position_title_id: sel_positionTitle.selectedOptionValue || null,
			branch_id: sel_positionBranch.selectedOptionValue || appsmith.store?.hrSelectedBranchId || null,
			supervisor_position_id: sel_supervisorPosition.selectedOptionValue || null
		};

		return body;
	},

	async validatePositionSupervisor(positionId, supervisorPositionId) {
		if (!supervisorPositionId) return;

		if (positionId && String(positionId) === String(supervisorPositionId)) {
			throw new Error("Должность не может быть руководителем самой себя");
		}

		const response = await items.getItems({
			collection: "positions",
			fields: "id,supervisor_position_id.id",
			limit: -1
		});

		const supervisorByPositionId = {};
		for (const row of response.data || []) {
			supervisorByPositionId[row.id] = row.supervisor_position_id?.id ?? row.supervisor_position_id ?? null;
		}

		if (positionId) {
			supervisorByPositionId[positionId] = supervisorPositionId;
		}

		const seen = new Set();
		let currentId = supervisorPositionId;

		while (currentId) {
			const key = String(currentId);

			if (positionId && key === String(positionId)) {
				throw new Error("Нельзя сохранить: возникает цикличность руководства");
			}

			if (seen.has(key)) {
				throw new Error("В цепочке руководства уже есть цикл");
			}

			seen.add(key);
			currentId = supervisorByPositionId[currentId];
		}
	},

	async savePosition() {
		const mode = appsmith.store?.hrPositionModalMode || "add";
		const selectedPosition = appsmith.store?.hrSelectedPositionDraft;
		const body = this.getPositionFormData();
		const employeeId = sel_empl2position.selectedOptionValue || null;
		const assignmentStartDate = this.formatDateValue(dp_startDateEmpl2Pos.selectedDate);

		if (!body.position_title_id) {
			showAlert("Выберите название должности", "warning");
			return;
		}
		if (!body.branch_id) {
			showAlert("Выберите подразделение", "warning");
			return;
		}

		if (mode === "add" && employeeId && !assignmentStartDate) {
			showAlert("Укажите дату назначения сотрудника", "warning");
			return;
		}
		try {
			await this.validatePositionSupervisor(
				mode === "edit" ? selectedPosition?.id : null,
				body.supervisor_position_id
			);
		} catch (error) {
			showAlert(error?.message || "Ошибка проверки руководителя", "warning");
			return;
		}

		let savedPositionId = selectedPosition?.id || null;
		let assignmentCreated = false;

		if (mode === "edit") {
			await items.updateItems({
				collection: "positions",
				body: { keys: [selectedPosition.id], data: body }
			});
		} else {
			const createdPosition = await items.createItems({ collection: "positions", body });
			savedPositionId = this.getCreatedRecordId(createdPosition);

			if (employeeId) {
				await this.createOfficeTermAssignment({
					user_id: employeeId,
					position_id: savedPositionId,
					date_from: assignmentStartDate
				});
				assignmentCreated = true;
			}
		}

		closeModal(mdl_addEditPosition.name);
		await Promise.all([
			this.refreshPositionsPage({ notify: false }),
			assignmentCreated ? this.refreshEmployeesPage({ notify: false }) : Promise.resolve()
		]);
		showAlert(
			assignmentCreated ? "Должность добавлена, сотрудник назначен" : (mode === "edit" ? "Должность обновлена" : "Должность добавлена"),
			"success"
		);
	},

	datesOverlap(startA, endA, startB, endB) {
		const aStart = moment(startA);
		const aEnd = endA ? moment(endA) : moment("9999-12-31");
		const bStart = moment(startB);
		const bEnd = endB ? moment(endB) : moment("9999-12-31");

		return aStart.isSameOrBefore(bEnd, "day") && bStart.isSameOrBefore(aEnd, "day");
	},

	async validateOfficeTermPeriod({ id, user_id, position_id, date_from, date_till }) {
		if (!user_id) throw new Error("Выберите сотрудника");
		if (!position_id) throw new Error("Выберите должность");
		if (!date_from) throw new Error("Укажите дату начала");
		if (date_till && moment(date_till).isBefore(moment(date_from), "day")) {
			throw new Error("Дата окончания не может быть раньше даты начала");
		}

		const response = await items.getItems({
			collection: "office_terms",
			fields: "id,user_id.id,position_id.id,date_from,date_till",
			filter: {
				_or: [
					{ user_id: { id: { _eq: user_id } } },
					{ position_id: { id: { _eq: position_id } } }
				]
			},
			limit: -1
		});

		for (const term of (response.data || [])) {
			if (String(term.id) === String(id)) continue;

			const termUserId = term?.user_id?.id ?? term?.user_id;
			const termPositionId = term?.position_id?.id ?? term?.position_id;
			const overlaps = this.datesOverlap(date_from, date_till, term.date_from, term.date_till);

			if (!overlaps) continue;

			if (String(termUserId) === String(user_id) && String(termPositionId) === String(position_id)) {
				throw new Error("У сотрудника уже есть назначение на эту должность в указанный период");
			}

			if (String(termPositionId) === String(position_id)) {
				throw new Error("Должность уже занята другим сотрудником в указанный период");
			}
		}
	},

	async saveOfficeTermHistory(rowParam = null) {
		const rawRow =
					rowParam ||
					(tbl_officeTermHistory.isAddRowInProgress
					 ? tbl_officeTermHistory.newRow
					 : (tbl_officeTermHistory.updatedRows?.[0] || tbl_officeTermHistory.updatedRow || tbl_officeTermHistory.selectedRow));

		const row = this.normalizeTableRow(rawRow);
		const historyMode = appsmith.store?.hrOfficeTermHistoryMode || "position";
		const selectedUserId =
					row.user_id ||
					(historyMode === "employee" ? appsmith.store?.hrSelectedEmployeeRow?.user_id : null) ||
					appsmith.store?.hrSelectedPosition?.user_id;

		const selectedPositionId =
					historyMode === "position"
		? appsmith.store?.hrSelectedPosition?.id
		: null;

		const officeTermId = row.office_term_id || row.id || null;
		const body = {
			user_id: selectedUserId,
			position_id: selectedPositionId || row.position_id || null,
			date_from: row.date_from ? moment(row.date_from).format("YYYY-MM-DD") : null,
			date_till: row.date_till ? moment(row.date_till).format("YYYY-MM-DD") : null,
			comment: row.comment || ""
		};

		try {
			await this.validateOfficeTermPeriod({ id: officeTermId, ...body });

			if (officeTermId) {
				await items.updateItems({
					collection: "office_terms",
					body: { keys: [officeTermId], data: body }
				});
			} else {
				await items.createItems({
					collection: "office_terms",
					body
				});
			}

			resetWidget("tbl_officeTermHistory", true);
			await Promise.all([
				this.refreshPositionsPage({ notify: false }),
				this.refreshEmployeesPage({ notify: false })
			]);

			if (historyMode === "employee") {
				await utils.getOfficeTermHistory({ userId: body.user_id });
			} else {
				await utils.getOfficeTermHistory({ positionId: body.position_id });
			}
			showAlert("Назначение сохранено", "success");
		} catch (error) {
			showAlert(error?.message || "Ошибка сохранения назначения", "warning");
			throw error;
		}
	}
}
