export default {
	/// ================== test block ==================
	test: async () => {
		removeValue("periodMonth");
		// const now = new Date();
		// 
		// console.log("initPeriod(): now: ", now.toISOString());
		// const firstDay = new Date(
		// now.getFullYear(),
		// now.getMonth(),
		// 1
		// );
		// console.log("initPeriod(): firstDay: ", firstDay.toISOString());
		const now = new Date();

		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, "0");

		const iso = `${y}-${m}-01`;   // БЕЗ UTC СДВИГА
		await storeValue("periodMonth", iso, true);

		return iso;
	},
	/// ============== end of test block ===============

	advanceInRub() {
		const salary = appsmith.store?.salaryOfPeriod;
		const pct = Number(salary?.max_cash_advance_percent);

		if (!Number.isFinite(pct) || pct <= 0) return "—";

		const rows = tbl_salaryAccruals?.tableData || [];

		const base = rows.reduce((sum, r) => {
			const ok =
						r.branch_account_type === "CASH" &&
						r.counts_for_salary_total === true &&
						r.counts_for_cashless_limit === false;

			return sum + (ok ? (Number(r.amount) || 0) : 0);
		}, 0);

		const advance = (base * pct) / 100;
		// убираем .00, если копеек нет
		const formatted = utils.formatMoneyRu(advance);

		return `${formatted} ₽`;
	},

	formatMoneyRu(amount) {
		const n = Number(amount) || 0;
		const rounded = Math.round(n * 100) / 100; // защита от float-noise
		return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
	},

	async getAccrualTypesRaw() {
		try {
			// Fields to fetch
			const fields = [
				"*"
			].join(",");

			const params = {
				fields: fields,
				collection: "salary_accrual_types",
			};
			const response = await items.getItems(params);
			const allBranches = response.data || [];
			// Sort by name (ascending)
			allBranches.sort((a, b) => a.name.localeCompare(b.name));
			return allBranches;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	async getAccrualTypesOptions() {
		const rows = await this.getAccrualTypesRaw();

		return rows.map(x => ({
			label: x.name,
			value: x.id,
		}));
	},

	toLocalYMD(date) {
		const d = new Date(date);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = "01";
		return `${y}-${m}-${day}`;
	},

	YM_01day(date) {
		const d = new Date(date);
		d.setDate(1);
		return d.toISOString().slice(0, 10);
	},

	async getOfficeTerms() {
		try {
			const branchId = sel_chooseBranch.selectedOptionValue;
			let filter = [];
			if (branchId) {
				filter = {
					position_id: {
						branch_id: {
							id: {
								"_eq": branchId
							}
						}
					}
				};
			}
			// Define the fields to include in the response
			const fields = [
				"id",
				"user_id.id",
				"user_id.first_name",
				"user_id.last_name",
				"position_id.title_id.title",
				"position_id.branch_id.id",
				"position_id.branch_id.name",
			].join(",");

			const params = {
				collection: "office_term",
				fields: fields,
				filter: filter,
			};
			const response = await items.getItems(params);

			// Transform the data as needed
			const sourceData = response.data ;
			let contacts = sourceData.map(item => ({
				id: item.id,
				user_id: item.user_id.id,
				// last_name: item.user_id.last_name,
				// first_name: item.user_id.first_name,
				employee: `${item.user_id.last_name} ${item.user_id.first_name[0]}.`,
				// initials: `${item.user_id.first_name[0]}.`,
				title: item.position_id.title_id.title,
				branch_id: item.position_id.branch_id.id,
				branch_name: item.position_id.branch_id.name,
			}));
			// Remove duplicates by user ID
			const seen = new Set();
			contacts = contacts.filter(c => {
				if (seen.has(c.user_id)) return false;
				seen.add(c.user_id);
				return true;
			});

			contacts.sort((a, b) => a.employee.localeCompare(b.employee));

			return contacts;
		} catch (error) {
			console.error('Error fetching office terms:', error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	async getBranches() {
		try {
			// Fields to fetch
			const fields = [
				"*"
			].join(",");

			const params = {
				fields: fields,
				collection: "branches",
			};
			const response = await items.getItems(params);
			const allBranches = response.data || [];
			// Sort by name (ascending)
			allBranches.sort((a, b) => a.name.localeCompare(b.name));
			return allBranches;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},


	async getBranchAccountsRaw() {
		try {
			// Fields to fetch
			const fields = [
				"id", "name", "type"
			].join(",");

			const params = {
				fields: fields,
				collection: "branch_accounts",
			};
			const response = await items.getItems(params);
			const allBranches = response.data || [];
			// Sort by name (ascending)
			allBranches.sort((a, b) => a.name.localeCompare(b.name));
			return allBranches;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	async getBranchAccountsOptions() {
		const rows = await this.getBranchAccountsRaw();

		return rows.map(x => ({
			label: x.name,
			value: x.id,
		}));
	},

	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name;
		const first = user.first_name?.[0];
		return `${last} ${first}.`;
	},

	async reloadSalaryContext() {
		await storeValue("salaryReady", false, true);

		await salary.loadSalary();          // обновит appsmith.store.salaryOfPeriod (и id)
		await payments.loadSalaryPayments();  // загрузка выплат для нового salaryId
		await accruals.loadSalaryAccruals();  // загрузка начислений для нового salaryId
		await salary.paymentsSummaryText();
		utils.advanceInRub();
		await storeValue("salaryReady", true, true);
	},

	async initPeriod() {
		if (!appsmith.store.periodMonth) {
			const now = new Date();

			const y = now.getFullYear();
			const m = String(now.getMonth() + 1).padStart(2, "0");

			const iso = `${y}-${m}-01`;   // БЕЗ UTC СДВИГА
			await storeValue("periodMonth", iso, true);

			return iso;
		}
		return appsmith.store.periodMonth;
	},

	async shiftPeriod(monthOffset = 0) {
		const base = new Date(appsmith.store.periodMonth);
		const firstDay = new Date(
			base.getFullYear(),
			base.getMonth() + monthOffset,
			1
		);

		const y = firstDay.getFullYear();
		const m = String(firstDay.getMonth() + 1).padStart(2, "0");
		const iso = `${y}-${m}-01`;

		await storeValue("periodMonth", iso, true);

		await utils.reloadSalaryContext();

		return iso;
	},

	getPeriodMonth() {
		return appsmith.store.periodMonth || null;
	},
	
	extractValue(widget) {
		if (!widget) return null;

		// Input, TextArea
		if ("text" in widget) return widget.text;

		// Select, Dropdown
		if ("selectedOptionValue" in widget) {
			return widget.selectedOptionValue;
		}

		throw new Error("Unsupported widget type");
	}

}