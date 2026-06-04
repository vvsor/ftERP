export default {
	positionsRefreshPromise: null,

	async getSupervisorPositionOptions({ commitToStore = true } = {}) {
		const [positionsRes, officeTerms] = await Promise.all([
			items.getItems({
				collection: "positions",
				fields: [
					"id",
					"position_title_id.id",
					"position_title_id.title",
					"branch_id.id",
					"branch_id.name",
					"supervisor_position_id.id"
				].join(","),
				limit: -1
			}),
			Array.isArray(appsmith.store?.hrCurrentOfficeTerms)
			? appsmith.store.hrCurrentOfficeTerms
			: hrOfficeTerms.getCurrentOfficeTerms()
		]);

		const employeeByPositionId = {};
		for (const term of officeTerms || []) {
			const positionId = term?.position_id?.id ?? term?.position_id;
			const user = term?.user_id;
			if (!positionId || !user?.id) continue;

			const current = employeeByPositionId[positionId];
			if (!current || String(term.date_from || "") > String(current.date_from || "")) {
				employeeByPositionId[positionId] = {
					employee: utils.formatUserName(user),
					date_from: term.date_from || ""
				};
			}
		}

		const options = (positionsRes.data || [])
		.map((position) => {
			const id = position.id;
			const title = position.position_title_id?.title || "";
			const branch = position.branch_id?.name || "";
			const employee = employeeByPositionId[id]?.employee || "";

			return {
				label: [branch, title, employee ? `(${employee})` : ""].filter(Boolean).join(" - "),
				value: id
			};
		})
		.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

		if (commitToStore) await storeValue("hrSupervisorPositionOptions", options, false);
		return options;
	},

	async getPositionsByBranch({ commitToStore = true } = {}) {
		const branchId = appsmith.store?.hrSelectedBranchId || "";
		const positionFilter = branchId ? { branch_id: { id: { _eq: branchId } } } : {};

		const [positionsRes, officeTerms] = await Promise.all([
			items.getItems({
				collection: "positions",
				fields: [
					"id",
					"position_title_id.id",
					"position_title_id.title",
					"branch_id.id",
					"branch_id.name",
					"supervisor_position_id.id",
					"supervisor_position_id.position_title_id.title",
					"comment"
				].join(","),
				filter: positionFilter,
				limit: -1
			}),
			Array.isArray(appsmith.store?.hrCurrentOfficeTerms)
			? appsmith.store.hrCurrentOfficeTerms
			: hrOfficeTerms.getCurrentOfficeTerms()
		]);

		const employeeByPositionId = {};

		for (const row of officeTerms || []) {
			const positionId = row?.position_id?.id ?? row?.position_id;
			const user = row?.user_id;

			if (!positionId || !user?.id) continue;

			const current = employeeByPositionId[positionId];
			const currentDate = current?.date_from || "";
			const nextDate = row.date_from || "";
			const roleId = user.role?.id ?? user.role ?? "";

			if (!current || nextDate > currentDate) {
				employeeByPositionId[positionId] = {
					office_term_id: row.id,
					user_id: user.id,
					employee: utils.formatUserName(user),
					first_name: user.first_name || "",
					last_name: user.last_name || "",
					middle_name: user.middle_name || "",
					email: user.email || "",
					role: roleId,
					role_label: utils.formatRoleName(user.role),
					date_from: row.date_from,
					date_till: row.date_till
				};
			}
		}

		const rows = (positionsRes.data || [])
		.map((position) => {
			const employee = employeeByPositionId[position.id] || {};
			const supervisorPosition = position.supervisor_position_id || {};
			const supervisorPositionId = supervisorPosition?.id ?? position.supervisor_position_id ?? null;
			const supervisorEmployee = employeeByPositionId[supervisorPositionId] || {};
			const supervisorTitle = supervisorPosition?.position_title_id?.title || "";

			return {
				id: position.id,
				title: position.position_title_id?.title || "",
				employee: employee.employee || "",
				first_name: employee.first_name || "",
				last_name: employee.last_name || "",
				middle_name: employee.middle_name || "",
				email: employee.email || "",
				role: employee.role || "",
				role_label: employee.role_label || "",
				user_id: employee.user_id || null,
				office_term_id: employee.office_term_id || null,
				date_from: employee.date_from || null,
				date_till: employee.date_till || null,
				comment: position.comment || "",
				branch_id: position.branch_id?.id ?? null,
				branch_name: position.branch_id?.name || "",
				position_title_id: position.position_title_id?.id ?? position.position_title_id ?? null,
				supervisor_position_id: supervisorPositionId,
				supervisor_title: supervisorTitle,
				supervisor_employee: supervisorEmployee.employee || "",
				supervisor_display: [supervisorTitle, supervisorEmployee.employee].filter(Boolean).join(" - ")
			};
		})
		.sort((a, b) => {
			const branchCompare = String(a.branch_name || "").localeCompare(String(b.branch_name || ""));
			return branchCompare || String(a.title || "").localeCompare(String(b.title || ""));
		});

		if (commitToStore) await storeValue("hrPositionRows", rows, false);
		return rows;
	},

	getSelectedPositionRowIndex() {
		const rows = tbl_positions.tableData || [];
		const selectedId = appsmith.store?.hrSelectedPosition?.id;
		if (!selectedId) return -1;

		return rows.findIndex((row) => String(row.id) === String(selectedId));
	},

	async tbl_positions_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_positions.selectedRow;

		if (!row?.id) {
			await storeValue("hrSelectedPosition", null, true);
			await storeValue("hrOfficeTermHistoryMode", "position", true);
			await storeValue("hrOfficeTermHistoryRows", [], false);
			await utils.refreshSelectedPositionFunctionals(null);
			return;
		}

		await storeValue("hrSelectedPosition", row, true);
		await storeValue("hrOfficeTermHistoryMode", "position", true);
		await hrOfficeTerms.getOfficeTermHistory({ positionId: row.id });
		await utils.refreshSelectedPositionFunctionals(row.position_title_id || null);
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
		const rows = await this.getPositionsByBranch();
		const selectedPosition =
					keepSelection && previousPositionId
		? (rows.find((row) => String(row.id) === String(previousPositionId)) || rows[0] || null)
		: (rows[0] || null);

		await storeValue("hrSelectedPosition", selectedPosition, true);

		if (selectedPosition?.id) {
			await storeValue("hrOfficeTermHistoryMode", "position", true);
			await hrOfficeTerms.getOfficeTermHistory({ positionId: selectedPosition.id });
			await utils.refreshSelectedPositionFunctionals(selectedPosition.position_title_id || null);
		} else {
			await storeValue("hrOfficeTermHistoryRows", [], false);
			await utils.refreshSelectedPositionFunctionals(null);
		}

		return rows;
	},

	async refreshPositionsPage({ notify = true } = {}) {
		if (this.positionsRefreshPromise) return await this.positionsRefreshPromise;

		this.positionsRefreshPromise = (async () => {
			await storeValue("hrPositionsRefreshing", true, false);
			try {
				await Promise.all([
					utils.getPositionTitleRows(),
					utils.getBranches(),
					utils.getFunctionGroupRows(),
					utils.getDutyRows(),
					hrOfficeTerms.getCurrentOfficeTerms()
				]);

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
			employee: sourceRow.employee || "",
			comment: sourceRow.comment || ""
		} : {
			branch_id: appsmith.store?.hrSelectedBranchId || null
		};

		await Promise.all([
			this.getSupervisorPositionOptions(),
			utils.getEmployees()
		]);
		await storeValue("hrPositionModalMode", isEdit ? "edit" : "add", true);
		await storeValue("hrSelectedPositionDraft", position, true);

		resetWidget("mdl_addEditPosition", true);
		showModal(mdl_addEditPosition.name);
	},

	closePositionModal() {
		closeModal(mdl_addEditPosition.name);
	},

	getPositionFormData() {
		return {
			position_title_id: sel_positionTitle.selectedOptionValue || null,
			branch_id: sel_positionBranch.selectedOptionValue || appsmith.store?.hrSelectedBranchId || null,
			supervisor_position_id: sel_supervisorPosition.selectedOptionValue || null
		};
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
		const employeeId = mode === "add" ? (sel_empl2position.selectedOptionValue || null) : null;
		const assignmentStartDate = mode === "add" ? hrOfficeTerms.formatDateValue(dp_startDateEmpl2Pos.selectedDate) : null;

		if (!body.position_title_id) return showAlert("Выберите название должности", "warning");
		if (!body.branch_id) return showAlert("Выберите подразделение", "warning");
		if (employeeId && !assignmentStartDate) return showAlert("Укажите дату назначения сотрудника", "warning");

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
			savedPositionId = hrOfficeTerms.getCreatedRecordId(createdPosition);

			if (employeeId) {
				await hrOfficeTerms.createOfficeTermAssignment({
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
			assignmentCreated ? hrEmployees.refreshEmployeesPage({ notify: false }) : Promise.resolve()
		]);
		showAlert(
			assignmentCreated ? "Должность добавлена, сотрудник назначен" : (mode === "edit" ? "Должность обновлена" : "Должность добавлена"),
			"success"
		);
	}
}