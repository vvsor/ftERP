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
			role: sourceRow.role || ""
		} : null;

		await storeValue("hrEmployeeModalMode", isEdit ? "edit" : "add", true);
		await storeValue("hrSelectedEmployee", employee, true);

		resetWidget("cnt_employee_profile", true);
		showModal(mdl_addEditEmployee.name);
	},

	async tbl_positions_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_positions.selectedRow || tbl_employees.selectedRow;

		if (!row?.id) {
			await storeValue("hrSelectedPosition", null, true);
			await storeValue("hrOfficeTermHistoryRows", [], false);
			return;
		}

		await storeValue("hrSelectedPosition", row, true);

		if (!row.user_id) {
			await storeValue("hrOfficeTermHistoryRows", [], false);
			return;
		}

		await utils.getOfficeTermHistoryByUser(row.user_id);
	},

	async tbl_employees_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_employees.selectedRow;

		if (!row?.user_id) {
			await storeValue("hrSelectedEmployeeRow", null, true);
			await storeValue("hrOfficeTermHistoryRows", [], false);
			return;
		}

		await storeValue("hrSelectedEmployeeRow", row, true);
		await utils.getOfficeTermHistoryByUser(row.user_id);
	},


	async setSelectedOfficeTerm(officeTerm){
		return await storeValue("SelectedOfficeTerm", officeTerm, true);
	},

	async sel_chooseBranch_OptionChanged(branchIdParam) {
		const branchId = branchIdParam || sel_chooseBranch.selectedOptionValue || "";
		const previousBranchId = appsmith.store?.hrSelectedBranchId || "";

		if (String(branchId) === String(previousBranchId)) return;

		await this.refreshHrBranch(branchId, { keepSelection: false });
	},

	async refreshHrBranch(branchId, { keepSelection = true } = {}) {
		if (!branchId) {
			await storeValue("hrSelectedBranchId", "", true);
			await storeValue("hrPositionRows", [], false);
			await storeValue("hrSelectedPosition", null, true);
			await storeValue("hrOfficeTermHistoryRows", [], false);
			return [];
		}

		await storeValue("hrSelectedBranchId", branchId, true);

		const previousPositionId = appsmith.store?.hrSelectedPosition?.id;
		const rows = await utils.getPositionsByBranch();
		const selectedPosition =
					keepSelection && previousPositionId
		? (rows.find((row) => String(row.id) === String(previousPositionId)) || rows[0] || null)
		: (rows[0] || null);

		await storeValue("hrSelectedPosition", selectedPosition, true);

		if (selectedPosition?.user_id) {
			await utils.getOfficeTermHistoryByUser(selectedPosition.user_id);
		} else {
			await storeValue("hrOfficeTermHistoryRows", [], false);
		}

		return rows;
	},

	async refreshPositionsPage({ showAlert = true } = {}) {
		if (this.positionsRefreshPromise) return await this.positionsRefreshPromise;

		this.positionsRefreshPromise = (async () => {
			await storeValue("hrPositionsRefreshing", true, false);
			try {
				await utils.loadDictionaries();
				await utils.getBranches();

				const branchId = sel_chooseBranch.selectedOptionValue || appsmith.store?.hrSelectedBranchId || "";
				await this.refreshHrBranch(branchId);

				if (showAlert) showAlert("Должности обновлены", "success");
			} finally {
				await storeValue("hrPositionsRefreshing", false, false);
				this.positionsRefreshPromise = null;
			}
		})();

		return await this.positionsRefreshPromise;
	},

	async refreshEmployeesPage({ showAlert = true } = {}) {
		if (this.employeesRefreshPromise) return await this.employeesRefreshPromise;

		this.employeesRefreshPromise = (async () => {
			await storeValue("hrEmployeesRefreshing", true, false);
			try {
				await utils.getEmployees();

				if (showAlert) showAlert("Сотрудники обновлены", "success");
			} finally {
				await storeValue("hrEmployeesRefreshing", false, false);
				this.employeesRefreshPromise = null;
			}
		})();

		return await this.employeesRefreshPromise;
	},

	async initHR(){
		const user = appsmith.store?.user;

		// если операция восстановления ещё не завершена — просто не уходить на Auth
		// если user уже проверен и его нет — уходить
		if (!user || !user.token) {
			if (user?.email === 'vvs@osagent.ru') {
				showAlert('DEV bypass: normal user go to auth page, while vvs@osagent.ru stays here', 'warning');
			} else {
				showAlert('Требуется авторизация. Перенаправление на страницу входа.', 'info');
				navigateTo("Auth");
			};
			return;
		}

		// Only select positions if any exist
		try {
			await items.ensureFreshToken();
			await utils.loadDictionaries();

			const branches = await utils.getBranches();
			const selectedBranchId =
						appsmith.store?.hrSelectedBranchId || branches?.[0]?.id || "";

			if (selectedBranchId) {
				await this.refreshHrBranch(selectedBranchId, { keepSelection: false });
				await utils.getEmployees();
			} else {
				await storeValue("hrPositionRows", [], false);
			}

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

	getEmployeeFormData() {
		const email = inp_email.text?.trim();
		const password = inp_password.text?.trim();
		const role = sel_role.selectedOptionValue;

		const body = {
			first_name: inp_first_name.text?.trim() || "",
			last_name: inp_last_name.text?.trim() || "",
			middle_name: inp_middle_name.text?.trim() || ""
		};

		if (email) body.email = email;
		if (password) body.password = password;
		if (role) body.role = role;

		return body;
	},

	async saveEmployee() {
		const mode = appsmith.store?.hrEmployeeModalMode || "add";
		const selectedEmployee = appsmith.store?.hrSelectedEmployee;
		const body = this.getEmployeeFormData();

		if (!body.last_name || !body.first_name || !body.middle_name) {
			showAlert("Заполните фамилию, имя и отчество", "warning");
			return;
		}
		// if (mode === "add" && !body.password) {
		// showAlert("Для нового пользователя нужен пароль", "warning");
		// return;
		// }

		if (mode === "edit") await items.updateUser(selectedEmployee.id, body);
		else await items.createUser(body);

		showAlert(mode === "edit" ? "Сотрудник обновлен" : "Сотрудник добавлен", "success");
		closeModal(mdl_addEditEmployee.name);
		await utils.getPositionsByBranch();
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

		await utils.getCityRows();
		await utils.getBranchDirectoryRows();
		showAlert("Город сохранен", "success");
	},

	async updateOfficeTermHistory(rowParam = null) {
		const rawRow = rowParam || tbl_officeTermHistory.updatedRows?.[0] || tbl_officeTermHistory.updatedRow;
		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const officeTermId = row?.office_term_id || row?.id;

		if (!officeTermId) {
			showAlert("Не найден office_term_id", "warning");
			return;
		}

		const comment = row.comment ?? "";

		await items.updateItems({
			collection: "office_terms",
			body: {
				keys: [officeTermId],
				data: { comment }
			}
		});

		const selectedPosition = appsmith.store?.hrSelectedPosition;
		if (String(selectedPosition?.office_term_id) === String(officeTermId)) {
			const updatedPosition = { ...selectedPosition, office_term_comment: comment };
			await storeValue("hrSelectedPosition", updatedPosition, true);

			const rows = (appsmith.store?.hrPositionRows || []).map((item) =>
																															String(item.office_term_id) === String(officeTermId)
																															? { ...item, office_term_comment: comment }
																															: item
																														 );
			await storeValue("hrPositionRows", rows, false);
		}

		await utils.getOfficeTermHistoryByUser(row.user_id || selectedPosition?.user_id);
		showAlert("Комментарий назначения сохранен", "success");
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
		await utils.getBranchDirectoryRows();
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

		await storeValue("hrPositionModalMode", isEdit ? "edit" : "add", true);
		await storeValue("hrSelectedPositionDraft", position, true);

		resetWidget("mdl_addEditPosition", true);
		showModal(mdl_addEditPosition.name);
	},

	closePositionModal() {
		closeModal(mdl_addEditPosition.name);
	},

	getPositionFormData() {
		const body = {
			position_title_id: sel_positionTitle.selectedOptionValue || null,
			branch_id: sel_positionBranch.selectedOptionValue || appsmith.store?.hrSelectedBranchId || null,
			supervisor_position_id: sel_supervisorPosition.selectedOptionValue || null
		};

		return body;
	},

	async savePosition() {
		const mode = appsmith.store?.hrPositionModalMode || "add";
		const selectedPosition = appsmith.store?.hrSelectedPositionDraft;
		const body = this.getPositionFormData();

		if (!body.position_title_id) {
			showAlert("Выберите название должности", "warning");
			return;
		}
		if (!body.branch_id) {
			showAlert("Выберите подразделение", "warning");
			return;
		}

		if (mode === "edit") {
			await items.updateItems({
				collection: "positions",
				body: { keys: [selectedPosition.id], data: body }
			});
		} else {
			await items.createItems({ collection: "positions", body });
		}

		closeModal(mdl_addEditPosition.name);
		await this.refreshPositionsPage();
		showAlert(mode === "edit" ? "Должность обновлена" : "Должность добавлена", "success");
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
		const selectedUserId =
					row.user_id ||
					appsmith.store?.hrSelectedEmployeeRow?.user_id ||
					appsmith.store?.hrSelectedPosition?.user_id;

		const officeTermId = row.office_term_id || row.id || null;
		const body = {
			user_id: selectedUserId,
			position_id: row.position_id || null,
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

			await utils.getOfficeTermHistoryByUser(body.user_id);
			await this.refreshPositionsPage({ showAlert: false });
			await this.refreshEmployeesPage({ showAlert: false });

			showAlert("Назначение сохранено", "success");
		} catch (error) {
			showAlert(error?.message || "Ошибка сохранения назначения", "warning");
			throw error;
		}
	}
}
