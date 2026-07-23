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
			{ label: "Да", value: "read" }
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

	normalizeBranchIds(value) {
		const values = Array.isArray(value) ? value : [value];
		return [...new Set(values
											 .map((item) => item?.value ?? item?.id ?? item)
											 .filter((item) => item !== null && item !== undefined && item !== "")
											 .map(String))];
	},

	async refreshAccountsPage({ notify = false, keepSelection = true } = {}) {
		await this.getAccountRows();
		await this.ensureAccountSelection({ keepSelection });
		if (notify) showAlert("Счета обновлены", "success");
	},

	async getAccountRows({ commitToStore = true } = {}) {
		const [accountsResponse, linksResponse] = await Promise.all([
			items.getItems({
				collection: "branch_accounts",
				fields: "id,name,type,date_deleted",
				filter: { date_deleted: { _null: true } },
				limit: -1
			}),
			items.getItems({
				collection: "branch_accounts_branches",
				fields: "branch_accounts_id.id,branches_id.id,branches_id.name",
				limit: -1
			})
		]);

		const branchesByAccountId = new Map();

		for (const link of linksResponse.data || []) {
			const accountId = link.branch_accounts_id?.id ?? link.branch_accounts_id;
			const branchId = link.branches_id?.id ?? link.branches_id;
			if (!accountId || !branchId) continue;

			const branches = branchesByAccountId.get(String(accountId)) || [];
			branches.push({ id: branchId, name: link.branches_id?.name || "" });
			branchesByAccountId.set(String(accountId), branches);
		}

		const rows = (accountsResponse.data || []).map((row) => {
			const branches = [...(branchesByAccountId.get(String(row.id)) || [])]
			.sort((a, b) => String(a.name).localeCompare(String(b.name)));

			return {
				id: row.id,
				name: row.name || "",
				type: row.type || "",
				branch_ids: branches.map((branch) => branch.id),
				branch_names: branches.map((branch) => branch.name).filter(Boolean).join(", ")
			};
		}).sort((a, b) =>
						String(a.branch_names || "").localeCompare(String(b.branch_names || "")) ||
						String(a.name || "").localeCompare(String(b.name || ""))
					 );

		if (commitToStore) await storeValue("hrAccountRows", rows, false);
		return rows;
	},

	getFilteredAccountRows() {
		const rows = Array.isArray(appsmith.store?.hrAccountRows) ? appsmith.store.hrAccountRows : [];
		const branchId = sel_accountsBranch.selectedOptionValue || appsmith.store?.hrSelectedAccountBranchId || "";
		if (!branchId) return rows;

		return rows.filter((row) =>
											 (row.branch_ids || []).some((id) => String(id) === String(branchId))
											);
	},

	async syncAccountBranches(accountId, branchIds) {
		const desiredIds = this.normalizeBranchIds(branchIds);
		const existingResponse = await items.getItems({
			collection: "branch_accounts_branches",
			fields: "id,branches_id.id",
			filter: { branch_accounts_id: { id: { _eq: accountId } } },
			limit: -1
		});

		const existing = (existingResponse.data || []).map((link) => ({
			id: link.id,
			branchId: String(link.branches_id?.id ?? link.branches_id)
		}));
		const existingIds = new Set(existing.map((link) => link.branchId));

		for (const branchId of desiredIds) {
			if (!existingIds.has(branchId)) {
				await items.createItems({
					collection: "branch_accounts_branches",
					body: { branch_accounts_id: accountId, branches_id: branchId }
				});
			}
		}

		const linkIdsToDelete = existing
		.filter((link) => !desiredIds.includes(link.branchId))
		.map((link) => link.id);

		if (linkIdsToDelete.length) {
			await items.deleteItems({
				collection: "branch_accounts_branches",
				body: { keys: linkIdsToDelete }
			});
		}
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
		const branchIds = this.normalizeBranchIds(row.branch_ids);
		const body = {
			name: row?.name?.trim?.() || "",
			type: row.type || null
		};

		if (!body.name) return showAlert("Укажите название счета", "warning");
		if (!branchIds.length) return showAlert("Выберите хотя бы одно подразделение", "warning");
		if (!["CASH", "CASHLESS"].includes(body.type)) return showAlert("Выберите тип счета", "warning");

		let savedId = row.id || null;
		if (tbl_accounts.isAddRowInProgress || !savedId) {
			const created = await items.createItems({ collection: "branch_accounts", body });
			savedId = created?.data?.id || created?.id || null;
		} else {
			await items.updateItems({ collection: "branch_accounts", body: { keys: [savedId], data: body } });
		}

		await this.syncAccountBranches(savedId, branchIds);

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

		const [accessResponse, positionRows] = await Promise.all([
			items.getItems({
				collection: "branch_account_access",
				fields: "id,position_id.id,position_id.position_title_id.title,position_id.branch_id.id,position_id.branch_id.name,active,account_access,payments_access,accruals_access,branch_account_id.id",
				filter: { branch_account_id: { id: { _eq: accountId } } },
				limit: -1
			}),
			Array.isArray(appsmith.store?.hrPositionRows) ? appsmith.store.hrPositionRows : accounts.getEmployees()
		]);

		const positionById = {};

		for (const position of positionRows || []) {
			const positionId = position.position_id || position.id || null;
			if (positionId) positionById[String(positionId)] = position;
		}

		const rows = (accessResponse.data || []).map((access) => {
			const positionId = access.position_id?.id ?? access.position_id ?? null;
			if (!positionId) return null;
			const position = positionById[String(positionId)] || {};
			const branchName = access.position_id?.branch_id?.name || position.branch_name || "";
			const title = access.position_id?.position_title_id?.title || position.title || "";
			const fallbackName = [branchName, title, `#${positionId}`].filter(Boolean).join(" - ");

			return {
				id: access.id,
				access_id: access.id,
				branch_account_id: accountId,
				position_id: positionId,
				position_name: position.position_name || fallbackName,
				employee: position.employee || "",
				active: access.active !== false,
				account_access: access.account_access || "none",
				payments_access: access.payments_access || "none",
				accruals_access: access.accruals_access || "none"
			};
		}).filter((row) =>
							row &&
							row.active &&
							(
			row.account_access !== "none" ||
			row.payments_access !== "none" ||
			row.accruals_access !== "none"
		)
						 ).sort((a, b) => String(a.position_name || "").localeCompare(String(b.position_name || "")));

		if (commitToStore) await storeValue("hrAccountAccessRows", rows, false);
		return rows;
	},

	async saveAccessRow(rowParam = null) {
		const rawRow = rowParam || (tbl_curAccountAccess.updatedRows?.[0] || tbl_curAccountAccess.updatedRow || tbl_curAccountAccess.selectedRow);
		const row = this.normalizeTableRow(rawRow);
		const accountId = row.branch_account_id || appsmith.store?.hrSelectedAccount?.id || null;
		const positionId = row.position_id || null;
		if (!accountId) return showAlert("Выберите счет", "warning");
		if (!positionId) return showAlert("Выберите позицию", "warning");

		const body = {
			position_id: positionId,
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
	},

	getCurrentUserId() {
		return appsmith.store?.user?.id || null;
	},

	async openConfirm({ title, action, payload = {} }) {
		await storeValue("hrConfirm", { title, action, payload }, true);
		showModal(mdl_confirm.name);
	},

	async confirmAction() {
		const confirm = appsmith.store?.hrConfirm || {};
		closeModal(mdl_confirm.name);

		if (confirm.action === "deleteAccount") {
			return await this.deleteAccountSoft(confirm.payload?.id);
		}

		if (confirm.action === "deleteAccountAccess") {
			return await this.deleteAccountAccess(confirm.payload?.id);
		}
	},

	async requestDeleteAccount(rowParam = null) {
		const row = this.normalizeTableRow(rowParam || tbl_accounts.triggeredRow || tbl_accounts.selectedRow);
		if (!row?.id) return showAlert("Выберите счет для удаления", "warning");

		await this.openConfirm({
			title: `Удалить счет "${row.name || row.id}"?`,
			action: "deleteAccount",
			payload: { id: row.id }
		});
	},

	async deleteAccountSoft(accountId) {
		if (!accountId) return showAlert("Не найден ID счета", "warning");

		await items.updateItems({
			collection: "branch_accounts",
			body: {
				keys: [accountId],
				data: {
					user_deleted: this.getCurrentUserId(),
					date_deleted: new Date().toISOString()
				}
			}
		});

		await this.refreshAccountsPage({ keepSelection: false });
		showAlert("Счет удален", "success");
	},

	async requestDeleteAccountAccess(rowParam = null) {
		const row = this.normalizeTableRow(rowParam || tbl_curAccountAccess.triggeredRow || tbl_curAccountAccess.selectedRow);
		const accessId = row?.access_id || row?.id;
		if (!accessId) return showAlert("Выберите запись доступа для удаления", "warning");

		await this.openConfirm({
			title: `Удалить доступ "${row.position_name || row.employee || accessId}"?`,
			action: "deleteAccountAccess",
			payload: { id: accessId }
		});
	},

	async deleteAccountAccess(accessId) {
		if (!accessId) return showAlert("Не найден ID доступа", "warning");

		await items.deleteItems({
			collection: "branch_account_access",
			body: { keys: [accessId] }
		});

		await this.getAccountAccessRows(appsmith.store?.hrSelectedAccount?.id || null);
		showAlert("Доступ удален", "success");
	},

	async initAccountsStores() {
		const defaults = {
			hrAccountRows: [],
			hrAccountAccessRows: [],
			hrBranchRows: [],
			hrPositionRows: []
		};

		await Promise.all(
			Object.entries(defaults)
			.filter(([key]) => !Array.isArray(appsmith.store?.[key]))
			.map(([key, value]) => storeValue(key, value, false))
		);
	},

	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, `${first}${middle}`].filter(Boolean).join(" ").trim();
	},

	async getBranches({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "branches",
			fields: "id,name",
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => ({
			id: row.id,
			name: row.name || ""
		}))
		.sort((a, b) => String(a.name).localeCompare(String(b.name)));

		if (commitToStore) await storeValue("hrBranchRows", rows, false);
		return rows;
	},

	async getEmployees({ commitToStore = true } = {}) {
		const today = moment().format("YYYY-MM-DD");
		const [positionsResponse, officeTermsResponse] = await Promise.all([
			items.getItems({
				collection: "positions",
				fields: "id,position_title_id.id,position_title_id.title,branch_id.id,branch_id.name",
				limit: -1
			}),
			items.getItems({
				collection: "office_terms",
				fields: "id,date_from,position_id.id,user_id.id,user_id.first_name,user_id.last_name,user_id.middle_name,user_id.email",
				filter: {
					_and: [
						{ date_from: { _lte: today } },
						{ _or: [{ date_till: { _null: true } }, { date_till: { _gte: today } }] }
					]
				},
				limit: -1
			})
		]);

		const employeeByPositionId = {};

		for (const term of officeTermsResponse.data || []) {
			const positionId = term?.position_id?.id ?? term?.position_id ?? null;
			const user = term?.user_id || {};
			if (!positionId || !user?.id) continue;

			const current = employeeByPositionId[String(positionId)];
			const nextDate = term.date_from || "";
			if (!current || nextDate > current.date_from) {
				employeeByPositionId[String(positionId)] = {
					employee: this.formatUserName(user) || user.email || "",
					user_id: user.id,
					date_from: nextDate
				};
			}
		}

		const rows = (positionsResponse.data || [])
		.map((position) => {
			const positionId = position.id;
			const branchName = position.branch_id?.name || "";
			const title = position.position_title_id?.title || "";
			const employee = employeeByPositionId[String(positionId)] || {};
			const positionName = [branchName, title, employee.employee ? `(${employee.employee})` : `#${positionId}`].filter(Boolean).join(" - ");

			return {
				id: positionId,
				position_id: positionId,
				position_name: positionName,
				title,
				branch_id: position.branch_id?.id ?? position.branch_id ?? null,
				branch_name: branchName,
				employee: employee.employee || "",
				user_id: employee.user_id || null
			};
		})
		.sort((a, b) => String(a.position_name).localeCompare(String(b.position_name)));

		if (commitToStore) await storeValue("hrPositionRows", rows, false);
		return rows;
	},
	async initAccounts() {
		await this.initAccountsStores();
		const user = appsmith.store?.user;
		const isEditMode = appsmith.mode === "EDIT";

		if (!user?.token) {
			if (isEditMode) {
				showAlert("EDIT: нет токена пользователя, остаёмся на странице Accounts без загрузки данных.", "warning");
			} else {
				showAlert("Требуется авторизация. Перенаправление на страницу входа.", "info");
				navigateTo("Auth");
			}
			return;
		}

		const hasAccountsAccess = await nav.hasPage("accounts");

		if (!hasAccountsAccess) {
			showAlert("Нет доступа к странице Accounts.", "warning");

			if (!isEditMode) {
				navigateTo("Auth");
				return;
			}
		}

		try {
			await items.ensureFreshToken();
			await Promise.all([
				this.getBranches(),
				this.getEmployees()
			]);
			await accounts.refreshAccountsPage({ notify: false, keepSelection: false });
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading Accounts:", error);
		}
	}
}
