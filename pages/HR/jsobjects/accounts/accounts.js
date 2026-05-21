export default {
	getAccountTypeOptions() {
		return [
			{ label: "Наличный", value: "CASH" },
			{ label: "Безналичный", value: "CASHLESS" }
		];
	},

	getAccountAccessOptions() {
		return [
			{ label: "Нет", value: "none" },
			{ label: "Чтение", value: "read" }
		];
	},

	getReadWriteAccessOptions() {
		return [
			{ label: "Нет", value: "none" },
			{ label: "Чтение", value: "read" },
			{ label: "Запись", value: "write" }
		];
	},

	normalizeTableRow(row) {
		return { ...(row?.allFields || row || {}), ...(row?.updatedFields || {}) };
	},

	normalizeAccess(value, allowed = ["none", "read", "write"]) {
		const normalized = String(value || "none");
		return allowed.includes(normalized) ? normalized : "none";
	},

	normalizeBoolean(value, defaultValue = true) {
		if (value === undefined || value === null || value === "") return defaultValue;
		if (typeof value === "string") return value.toLowerCase() === "true";
		return !!value;
	},

	async refreshAccountsPage({ notify = false, keepSelection = true } = {}) {
		await this.getAccountRows();
		await this.ensureAccountSelection({ keepSelection });
		if (notify) showAlert("Счета обновлены", "success");
	},

	async getAccountRows({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "branch_accounts",
			fields: "id,name,type,branch_id.id,branch_id.name",
			limit: -1
		});

		const rows = (response.data || []).map((row) => ({
			id: row.id,
			name: row.name || "",
			type: row.type || "",
			branch_id: row.branch_id?.id ?? row.branch_id ?? null,
			branch_name: row.branch_id?.name || ""
		})).sort((a, b) =>
						 String(a.branch_name || "").localeCompare(String(b.branch_name || "")) ||
						 String(a.name || "").localeCompare(String(b.name || ""))
						);

		if (commitToStore) await storeValue("hrAccountRows", rows, false);
		return rows;
	},

	getFilteredAccountRows() {
		const rows = Array.isArray(appsmith.store?.hrAccountRows) ? appsmith.store.hrAccountRows : [];
		const branchId = sel_accountsBranch.selectedOptionValue || appsmith.store?.hrSelectedAccountBranchId || "";
		if (!branchId) return rows;
		return rows.filter((row) => String(row.branch_id || "") === String(branchId));
	},

	async onAccountBranchFilterChanged() {
		await storeValue("hrSelectedAccountBranchId", sel_accountsBranch.selectedOptionValue || "", true);
		await this.ensureAccountSelection({ keepSelection: false });
	},

	async ensureAccountSelection({ keepSelection = true } = {}) {
		const rows = this.getFilteredAccountRows();
		const currentId = appsmith.store?.hrSelectedAccount?.id;
		const selected =
					(keepSelection && currentId ? rows.find((row) => String(row.id) === String(currentId)) : null) ||
					rows[0] ||
					null;

		await storeValue("hrSelectedAccount", selected, true);
		await this.getAccountAccessRows(selected?.id || null);
		return selected;
	},

	async tbl_accounts_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_accounts.selectedRow;
		await storeValue("hrSelectedAccount", row?.id ? row : null, true);
		await this.getAccountAccessRows(row?.id || null);
	},

	async saveAccountRow(rowParam = null) {
		const rawRow = rowParam || (tbl_accounts.isAddRowInProgress ? tbl_accounts.newRow : (tbl_accounts.updatedRows?.[0] || tbl_accounts.updatedRow || tbl_accounts.selectedRow));
		const row = this.normalizeTableRow(rawRow);
		const body = {
			name: row?.name?.trim?.() || "",
			branch_id: row.branch_id || sel_accountsBranch.selectedOptionValue || null,
			type: row.type || null
		};

		if (!body.name) return showAlert("Укажите название счета", "warning");
		if (!body.branch_id) return showAlert("Выберите подразделение", "warning");
		if (!["CASH", "CASHLESS"].includes(body.type)) return showAlert("Выберите тип счета", "warning");

		let savedId = row.id || null;
		if (tbl_accounts.isAddRowInProgress || !savedId) {
			const created = await items.createItems({ collection: "branch_accounts", body });
			savedId = created?.data?.id || created?.id || null;
		} else {
			await items.updateItems({ collection: "branch_accounts", body: { keys: [savedId], data: body } });
		}

		const rows = await this.getAccountRows();
		const selected = rows.find((item) => String(item.id) === String(savedId)) || rows[0] || null;
		await storeValue("hrSelectedAccount", selected, true);
		await this.getAccountAccessRows(selected?.id || null);
		showAlert("Счет сохранен", "success");
	},

	async getAccountAccessRows(accountIdParam = null, { commitToStore = true } = {}) {
		const accountId = accountIdParam || appsmith.store?.hrSelectedAccount?.id || null;
		if (!accountId) {
			if (commitToStore) await storeValue("hrAccountAccessRows", [], false);
			return [];
		}

		const [accessResponse, employeeRows] = await Promise.all([
			items.getItems({
				collection: "branch_account_access",
				fields: "id,user_id.id,active,account_access,payments_access,accruals_access,branch_account_id.id",
				filter: { branch_account_id: { id: { _eq: accountId } } },
				limit: -1
			}),
			Array.isArray(appsmith.store?.hrEmployeeRows) ? appsmith.store.hrEmployeeRows : utils.getEmployees()
		]);

		const accessByUserId = {};
		for (const row of accessResponse.data || []) {
			const userId = row.user_id?.id ?? row.user_id;
			if (userId) accessByUserId[String(userId)] = row;
		}

		const rows = (employeeRows || []).map((employee) => {
			const userId = employee.user_id || employee.id || null;
			if (!userId) return null;
			const access = accessByUserId[String(userId)] || null;
			return {
				id: access?.id || `${accountId}:${userId}`,
				access_id: access?.id || null,
				branch_account_id: accountId,
				user_id: userId,
				employee: employee.employee || employee.email || userId,
				active: access ? access.active !== false : true,
				account_access: access?.account_access || "none",
				payments_access: access?.payments_access || "none",
				accruals_access: access?.accruals_access || "none"
			};
		}).filter(Boolean).sort((a, b) => String(a.employee || "").localeCompare(String(b.employee || "")));

		if (commitToStore) await storeValue("hrAccountAccessRows", rows, false);
		return rows;
	},

	async saveAccessRow(rowParam = null) {
		const rawRow = rowParam || (tbl_curAccountAccess.updatedRows?.[0] || tbl_curAccountAccess.updatedRow || tbl_curAccountAccess.selectedRow);
		const row = this.normalizeTableRow(rawRow);
		const accountId = row.branch_account_id || appsmith.store?.hrSelectedAccount?.id || null;
		const userId = row.user_id || null;
		if (!accountId) return showAlert("Выберите счет", "warning");
		if (!userId) return showAlert("Выберите сотрудника", "warning");

		const body = {
			user_id: userId,
			branch_account_id: accountId,
			account_access: this.normalizeAccess(row.account_access, ["none", "read"]),
			payments_access: this.normalizeAccess(row.payments_access),
			accruals_access: this.normalizeAccess(row.accruals_access)
		};

		const hasAccess = body.account_access !== "none" || body.payments_access !== "none" || body.accruals_access !== "none";
		body.active = this.normalizeBoolean(row.active, true) && hasAccess;

		if (row.access_id) {
			await items.updateItems({ collection: "branch_account_access", body: { keys: [row.access_id], data: body } });
		} else {
			if (!hasAccess) return showAlert("Выберите хотя бы один доступ", "warning");
			await items.createItems({ collection: "branch_account_access", body });
		}

		await this.getAccountAccessRows(accountId);
		showAlert("Доступ сохранен", "success");
	}
}
