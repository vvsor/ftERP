export default {
	/// ================== test block ==================
	// async test(){
	// console.log(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
	// },
	/// ============== end of test block ===============
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

	async tbl_positions_onRowSelected() {
		const row = tbl_positions.selectedRow;

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

	async refreshPositionsPage() {
		await utils.loadDictionaries();
		await utils.getBranches();

		const branchId = sel_chooseBranch.selectedOptionValue || appsmith.store?.hrSelectedBranchId || "";
		await this.refreshHrBranch(branchId);

		showAlert("Должности обновлены", "success");
	},

	async refreshEmployeesPage() {
		await utils.loadDictionaries();
		await utils.getBranches();

		const branchId = sel_chooseBranchEmpl.selectedOptionValue || appsmith.store?.hrSelectedBranchId || "";
		await this.refreshHrBranch(branchId);

		showAlert("Сотрудники обновлены", "success");
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
		const body = {
			first_name: inp_first_name.text?.trim() || "",
			last_name: inp_last_name.text?.trim() || "",
			middle_name: inp_middle_name.text?.trim() || "",
			email: inp_email.text?.trim() || "",
			role: sel_role.selectedOptionValue || null
		};
		const password = inp_password.text?.trim();
		if (password) body.password = password;
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
	async savePositionTitleRow() {
		const row = tbl_position_titles.isAddRowInProgress ? tbl_position_titles.newRow : (tbl_position_titles.updatedRows?.[0] || tbl_position_titles.updatedRow);
		const body = { title: row.title?.trim() || "" };
		if (!body.title) return showAlert("Укажите название должности", "warning");

		if (tbl_position_titles.isAddRowInProgress) await items.createItems({ collection: "position_titles", body });
		else await items.updateItems({ collection: "position_titles", body: { keys: [row.id], data: body } });

		await utils.getPositionTitleRows();
		showAlert("Название должности сохранено", "success");
	},

	async saveCityRow() {
		const row = tbl_cities.isAddRowInProgress ? tbl_cities.newRow : (tbl_cities.updatedRows?.[0] || tbl_cities.updatedRow);
		const body = { city: row.name?.trim() || "" };
		if (!body.name) return showAlert("Укажите город", "warning");

		if (tbl_cities.isAddRowInProgress) await items.createItems({ collection: "cities", body });
		else await items.updateItems({ collection: "cities", body: { keys: [row.id], data: body } });

		await utils.getCityRows();
		await utils.getBranchDirectoryRows();
		showAlert("Город сохранен", "success");
	},

	async saveBranchRow() {
		const row = tbl_branches.isAddRowInProgress ? tbl_branches.newRow : (tbl_branches.updatedRows?.[0] || tbl_branches.updatedRow);
		const body = {
			name: row.name?.trim() || "",
			city_id: row.city_id || null
		};
		if (!body.name) return showAlert("Укажите подразделение", "warning");

		if (tbl_branches.isAddRowInProgress) await items.createItems({ collection: "branches", body });
		else await items.updateItems({ collection: "branches", body: { keys: [row.id], data: body } });

		await utils.getBranches();
		await utils.getBranchDirectoryRows();
		showAlert("Подразделение сохранено", "success");
	}
}
