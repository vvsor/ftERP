export default {
	getCurrentUserId() {
		return appsmith.store?.user?.id || null;
	},

	async getBranchAccountAccessRows() {
		const userId = this.getCurrentUserId();
		if (!userId) return [];

		const today = moment().format("YYYY-MM-DD");
		const officeTermsResponse = await items.getItems({
			collection: "office_terms",
			fields: "id,position_id.id",
			filter: {
				_and: [
					{ user_id: { id: { _eq: userId } } },
					{ date_from: { _lte: today } },
					{ _or: [{ date_till: { _null: true } }, { date_till: { _gte: today } }] }
				]
			},
			limit: -1
		});

		const positionIds = [...new Set((officeTermsResponse.data || [])
																		.map((row) => row.position_id?.id ?? row.position_id)
																		.filter(Boolean)
																		.map(String))];

		if (!positionIds.length) return [];

		const response = await items.getItems({
			collection: "branch_account_access",
			fields: "id,branch_account_id.id,position_id.id,active,account_access,payments_access,accruals_access",
			filter: {
				position_id: { id: { _in: positionIds } },
				active: { _eq: true }
			},
			limit: -1
		});

		return response.data || [];
	},	
	getAllowedBranchAccountIds(accessRows = [], accessField = "", allowed = ["read", "write"]) {
		if (!accessField) return [];
		return accessRows
			.filter((row) => allowed.includes(row?.[accessField]))
			.map((row) => row.branch_account_id?.id ?? row.branch_account_id)
			.filter(Boolean);
	},

	filterBranchAccountsByAccess(rows = [], accessRows = [], accessField = "", allowed = ["read", "write"]) {
		if (!accessField) return rows;

		const allowedIds = new Set(
			this.getAllowedBranchAccountIds(accessRows, accessField, allowed).map(String)
		);

		return rows.filter((row) => allowedIds.has(String(row.id)));
	},

	async getBranchAccountsRaw({ accessField = null, allowed = ["read", "write"], accessRows = null } = {}) {
		const branchId = appsmith.store?.salarySelectedBranchId ?? "";
		const filter = {
			_and: [
				{ date_deleted: { _null: true } },
				...(branchId ? [{ branch_id: { id: { _eq: branchId } } }] : [])
			]
		};

		const response = await items.getItems({
			collection: "branch_accounts",
			fields: "id,name,type,branch_id.id,date_deleted",
			filter,
			limit: -1
		});

		let rows = response.data || [];

		if (accessField) {
			const rowsAccess = accessRows || await this.getBranchAccountAccessRows();
			rows = this.filterBranchAccountsByAccess(rows, rowsAccess, accessField, allowed);
		}

		return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	},

	async getBranchAccountsOptions(params = {}) {
		const rows = await this.getBranchAccountsRaw(params);
		return rows.map((row) => ({
			label: row.name,
			value: row.id
		}));
	},

	async refreshBranchAccountAccessOptions() {
		const accessRows = await this.getBranchAccountAccessRows();
		const accountRows = await this.getBranchAccountsRaw();

		const paymentRows = this.filterBranchAccountsByAccess(accountRows, accessRows, "payments_access", ["read", "write"]);
		const accrualRows = this.filterBranchAccountsByAccess(accountRows, accessRows, "accruals_access", ["read", "write"]);
		const paymentWriteRows = this.filterBranchAccountsByAccess(accountRows, accessRows, "payments_access", ["write"]);
		const accrualWriteRows = this.filterBranchAccountsByAccess(accountRows, accessRows, "accruals_access", ["write"]);

		await Promise.all([
			storeValue("salaryPaymentBranchAccountOptions", paymentRows.map((row) => ({ label: row.name, value: row.id })), false),
			storeValue("salaryAccrualBranchAccountOptions", accrualRows.map((row) => ({ label: row.name, value: row.id })), false),
			storeValue("salaryPaymentWriteBranchAccountIds", paymentWriteRows.map((row) => row.id), false),
			storeValue("salaryAccrualWriteBranchAccountIds", accrualWriteRows.map((row) => row.id), false)
		]);

		return { paymentRows, accrualRows };
	},

	hasBranchAccountWriteAccess(accountId, storeKey) {
		const ids = Array.isArray(appsmith.store?.[storeKey]) ? appsmith.store[storeKey] : [];
		return ids.map(String).includes(String(accountId));
	}
}