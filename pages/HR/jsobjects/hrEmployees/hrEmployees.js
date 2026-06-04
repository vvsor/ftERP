export default {
	employeesRefreshPromise: null,

	getFilteredEmployeeRows() {
		const rows = Array.isArray(appsmith.store?.hrEmployeeRows) ? appsmith.store.hrEmployeeRows : [];
		const branchId = sel_chooseBranchEmployee.selectedOptionValue || "";
		if (!branchId) return rows;
		return rows.filter((row) => (row.branch_ids || []).some((id) => String(id) === String(branchId)));
	},

	async refreshSelectedEmployeeHistory(rowParam = null, employeeRowsParam = null) {
		const employeeRows = Array.isArray(employeeRowsParam)
		? employeeRowsParam
		: (Array.isArray(appsmith.store?.hrEmployeeRows) ? appsmith.store.hrEmployeeRows : []);
		const selectedUserId =
					rowParam?.user_id ||
					appsmith.store?.hrSelectedEmployeeRow?.user_id ||
					tbl_employees.selectedRow?.user_id ||
					null;
		const selectedRow =
					rowParam?.user_id
		? rowParam
		: (selectedUserId
			 ? employeeRows.find((row) => String(row.user_id) === String(selectedUserId))
			 : null);

		if (!selectedRow?.user_id) {
			await storeValue("hrSelectedEmployeeRow", null, true);
			await storeValue("hrEmployeeOfficeTermHistoryRows", [], false);
			return [];
		}

		await storeValue("hrSelectedEmployeeRow", selectedRow, true);
		return await hrOfficeTerms.getOfficeTermHistoryByUser(selectedRow.user_id);
	},

	getSelectedEmployeeRowIndex() {
		const rows = tbl_employees.tableData || [];
		const selectedUserId = appsmith.store?.hrSelectedEmployeeRow?.user_id;
		if (!selectedUserId) return -1;

		return rows.findIndex((row) => String(row.user_id) === String(selectedUserId));
	},

	async tbl_employees_onRowSelected(rowParam = null) {
		await storeValue("hrOfficeTermHistoryMode", "employee", true);
		return await this.refreshSelectedEmployeeHistory(rowParam || tbl_employees.selectedRow);
	},

	async refreshEmployeesPage({ notify = true } = {}) {
		if (this.employeesRefreshPromise) return await this.employeesRefreshPromise;

		this.employeesRefreshPromise = (async () => {
			await storeValue("hrEmployeesRefreshing", true, false);
			try {
				await hrOfficeTerms.getCurrentOfficeTerms();
				const employeeRows = await utils.getEmployees();
				await this.refreshSelectedEmployeeHistory(null, employeeRows);

				if (notify) showAlert("Сотрудники обновлены", "success");
			} finally {
				await storeValue("hrEmployeesRefreshing", false, false);
				this.employeesRefreshPromise = null;
			}
		})();

		return await this.employeesRefreshPromise;
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

	closeEmployeeModal() {
		closeModal(mdl_addEditEmployee.name);
	},

	normalizeSelectedIds(values = []) {
		return [...new Set((Array.isArray(values) ? values : [])
											 .map((value) => String(value || "").trim())
											 .filter(Boolean))];
	},

	getAssignableRoleIds() {
		return new Set(
			(Array.isArray(appsmith.store?.hrRoleOptions) ? appsmith.store.hrRoleOptions : [])
			.map((item) => String(item.value || "").trim())
			.filter(Boolean)
		);
	},

	getAssignablePolicyIds() {
		return new Set(
			(Array.isArray(appsmith.store?.hrPolicyOptions) ? appsmith.store.hrPolicyOptions : [])
			.map((item) => String(item.value || "").trim())
			.filter(Boolean)
		);
	},

	buildPoliciesPayload(userId, selectedPolicyIds = [], existingPolicyLinks = []) {
		const allowedPolicyIds = this.getAssignablePolicyIds();
		const selectedIds = this.normalizeSelectedIds(selectedPolicyIds)
		.filter((policyId) => allowedPolicyIds.has(policyId));
		const existingLinks = (Array.isArray(existingPolicyLinks) ? existingPolicyLinks : [])
		.map((item) => ({
			id: item?.id || null,
			policy_id: String(item?.policy_id || "").trim()
		}))
		.filter((item) => item.policy_id && allowedPolicyIds.has(item.policy_id));

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
		const selectedRole = String(sel_role.selectedOptionValue || "").trim();
		const role = this.getAssignableRoleIds().has(selectedRole) ? selectedRole : "";
		const selectedPolicyIds = this.normalizeSelectedIds(msel_policies.selectedOptionValues);
		const allowedPolicyIds = this.getAssignablePolicyIds();
		const policyIds = selectedPolicyIds.filter((policyId) => allowedPolicyIds.has(policyId));
		const hasForbiddenPolicies = policyIds.length !== selectedPolicyIds.length;

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

		return { body, policyIds, roleIsAllowed: Boolean(role), hasForbiddenPolicies };
	},

	async saveEmployee() {
		const mode = appsmith.store?.hrEmployeeModalMode || "add";
		const selectedEmployee = appsmith.store?.hrSelectedEmployee;
		const { body, policyIds, roleIsAllowed, hasForbiddenPolicies } = this.getEmployeeFormData({ isNew: mode === "add" });
		const positionId = sel_position4empl.selectedOptionValue || null;
		const assignmentStartDate = hrOfficeTerms.formatDateValue(dp_startDatePos2Empl.selectedDate);

		if (!body.last_name || !body.first_name) return showAlert("Заполните фамилию и имя", "warning");
		if (!roleIsAllowed) return showAlert("Выберите разрешенную роль", "warning");
		if (hasForbiddenPolicies) return showAlert("Выбрана недоступная политика доступа", "warning");
		if (mode === "add" && positionId && !assignmentStartDate) return showAlert("Укажите дату назначения на должность", "warning");

		if (mode === "add" && positionId) {
			try {
				await hrOfficeTerms.validatePositionAvailableForAssignment({
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
			const createdUserId = hrOfficeTerms.getCreatedRecordId(createdUser);

			if (!createdUserId) throw new Error("Не удалось получить ID созданного пользователя");

			if (policyIds.length) {
				await items.updateUser(createdUserId, {
					policies: this.buildPoliciesPayload(createdUserId, policyIds, [])
				});
			}

			if (positionId) {
				await hrOfficeTerms.createOfficeTermAssignment({
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
			hrPositions.refreshPositionsPage({ notify: false })
		]);
	}
}