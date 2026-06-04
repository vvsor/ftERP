export default {
	positionsRefreshPromise: null,

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
		await utils.getOfficeTermHistory({ positionId: row.id });
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
		const rows = await utils.getPositionsByBranch();
		const selectedPosition =
					keepSelection && previousPositionId
		? (rows.find((row) => String(row.id) === String(previousPositionId)) || rows[0] || null)
		: (rows[0] || null);

		await storeValue("hrSelectedPosition", selectedPosition, true);

		if (selectedPosition?.id) {
			await storeValue("hrOfficeTermHistoryMode", "position", true);
			await utils.getOfficeTermHistory({ positionId: selectedPosition.id });
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
					utils.getCurrentOfficeTerms()
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
			utils.getSupervisorPositionOptions(),
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