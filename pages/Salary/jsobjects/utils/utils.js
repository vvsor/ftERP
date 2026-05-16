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
		const formatted = utils.formatCurrencyRu(advance);

		return `${formatted} ₽`;
	},

	// formatMoneyRu(amount) {
	// const n = Number(amount) || 0;
	// const rounded = Math.round(n * 100) / 100; // защита от float-noise
	// return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
	// },

	formatCurrencyRu(amount) {
		const n = Number(amount) || 0;
		const rounded = Math.round(n * 100) / 100;
		const sign = rounded < 0 ? "-" : "";
		const abs = Math.abs(rounded);
		const integerPart = Math.trunc(abs);
		const fraction = Math.round((abs - integerPart) * 100);
		const integerText = String(integerPart).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

		if (fraction === 0) {
			return `${sign}${integerText}`;
		}

		return `${sign}${integerText},${String(fraction).padStart(2, "0")}`;
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
	async getSalaryByOfficeTermId(officeTerms = [], periodMonth) {
		const officeTermIds = officeTerms.map((term) => term.id).filter(Boolean);
		if (!periodMonth || officeTermIds.length === 0) return {};

		const response = await items.getItems({
			collection: "salary",
			fields: "*,office_term_id.id",
			filter: {
				_and: [
					{ period_month: { _eq: periodMonth } },
					{ office_term_id: { id: { _in: officeTermIds } } }
				]
			},
			limit: -1
		});

		return (response.data || []).reduce((acc, row) => {
			const officeTermId = row.office_term_id?.id ?? row.office_term_id;
			if (officeTermId) acc[officeTermId] = row;
			return acc;
		}, {});
	},

	async getAccrualsBySalaryId(salaryIds = []) {
		if (!salaryIds.length) return {};

		const response = await items.getItems({
			collection: "salary_accruals",
			fields: "salary_id.id,amount",
			filter: {
				_and: [
					{ salary_id: { id: { _in: salaryIds } } },
					{ deleted_at: { _null: true } }
				]
			},
			limit: -1
		});

		return (response.data || []).reduce((acc, row) => {
			const salaryId = row.salary_id?.id ?? row.salary_id;
			if (!salaryId) return acc;
			acc[salaryId] = (acc[salaryId] || 0) + (Number(row.amount) || 0);
			return acc;
		}, {});
	},

	async getPaymentsBySalaryId(salaryIds = []) {
		if (!salaryIds.length) return {};

		const response = await items.getItems({
			collection: "salary_payments",
			fields: "salary_id.id,amount",
			filter: {
				_and: [
					{ salary_id: { id: { _in: salaryIds } } },
					{ deleted_at: { _null: true } }
				]
			},
			limit: -1
		});

		return (response.data || []).reduce((acc, row) => {
			const salaryId = row.salary_id?.id ?? row.salary_id;
			if (!salaryId) return acc;
			acc[salaryId] = (acc[salaryId] || 0) + (Number(row.amount) || 0);
			return acc;
		}, {});
	},

	async getOfficeTerms({ commitToStore = true } = {}) {
		const branchId = appsmith.store?.salarySelectedBranchId ?? "";
		const periodMonth = appsmith.store?.periodMonth;
		const today = moment().format("YYYY-MM-DD");

		const officeFilter = {
			_and: [
				...(branchId ? [{ position_id: { branch_id: { id: { _eq: branchId } } } }] : []),
				{ date_from: { _lte: today } },
				{ _or: [{ date_till: { _null: true } }, { date_till: { _gte: today } }] }
			]
		};

		const fields = [
			"id",
			"user_id",
			"user_id.id",
			"user_id.first_name",
			"user_id.middle_name",
			"user_id.last_name",
			"position_id",
			"position_id.position_title_id.title",
			"position_id.branch_id.id",
			"position_id.branch_id.name"
		].join(",");

		const response = await items.getItems({
			collection: "office_terms",
			fields,
			filter: officeFilter,
			limit: -1
		});

		const officeTerms = response.data || [];
		const salaryByOfficeTermId = await utils.getSalaryByOfficeTermId(officeTerms, periodMonth);
		const salaryIds = Object.values(salaryByOfficeTermId).map((salary) => salary.id).filter(Boolean);
		const [accrualsBySalaryId, paymentsBySalaryId] = await Promise.all([
			utils.getAccrualsBySalaryId(salaryIds),
			utils.getPaymentsBySalaryId(salaryIds)
		]);

		const rows = officeTerms.map((term) => {
			const user = term.user_id || {};
			const position = term.position_id || {};
			const salaryRow = salaryByOfficeTermId[term.id] || null;
			const salaryId = salaryRow?.id ?? null;
			const accrualsSum = salaryId ? (accrualsBySalaryId[salaryId] || 0) : 0;
			const paymentsSum = salaryId ? (paymentsBySalaryId[salaryId] || 0) : 0;

			return {
				id: term.id,
				user_id: user.id ?? term.user_id ?? null,
				employee: utils.formatUserName(user),
				title: position?.position_title_id?.title ?? "—",
				branch_id: position?.branch_id?.id ?? null,
				branch_name: position?.branch_id?.name ?? "",
				salary_id: salaryId,
				accruals_sum: accrualsSum,
				payments_sum: paymentsSum,
				balance: accrualsSum - paymentsSum
			};
		});

		await storeValue("salaryByOfficeTermId", salaryByOfficeTermId, false);

		if (commitToStore) {
			await storeValue("salaryEmployeeRows", rows, false);
		}

		return rows;
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
			allBranches.sort((a, b) => a.name.localeCompare(b.name));

			await storeValue("salaryBranchRows", allBranches, true);
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
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, [first, middle].filter(Boolean).join(" ")].filter(Boolean).join(" ").trim();
	},

	async reloadSalaryContext({ refreshEmployees = false, salaryRecord: prefetchedSalaryRecord = null } = {}) {
		if (appsmith.store?.salaryReady !== false) {
			await storeValue("salaryReady", false, true);
		}

		const salaryRecord = await salary.loadSalary(prefetchedSalaryRecord);

		const paymentRowsPromise = payments.loadSalaryPayments(
			salaryRecord.id,
			{ commitToStore: false }
		);

		const accrualRowsPromise = accruals.loadSalaryAccruals(
			salaryRecord.id,
			{ commitToStore: false }
		);

		const employeeRowsPromise =
					(refreshEmployees || salaryRecord.__wasCreated)
		? utils.getOfficeTerms({ commitToStore: false })
		: Promise.resolve(null);

		const [paymentRows, accrualRows, employeeRows] = await Promise.all([
			paymentRowsPromise,
			accrualRowsPromise,
			employeeRowsPromise
		]);

		const storeJobs = [
			storeValue("salaryPaymentRows", paymentRows, false),
			storeValue("salaryAccrualRows", accrualRows, false),
			salary.setSalaryOfPeriod(salaryRecord)
		];

		if (employeeRows) {
			storeJobs.push(storeValue("salaryEmployeeRows", employeeRows, false));
		}

		await Promise.all(storeJobs);


		if (appsmith.store?.salaryReady !== true) {
			await storeValue("salaryReady", true, true);
		}

		return salaryRecord;

	},

	async refreshSelectedEmployeeSummaryFromDetails() {
		const officeTermId = appsmith.store?.SelectedOfficeTerm?.id;
		if (!officeTermId) return;

		const accrualRows = Array.isArray(appsmith.store?.salaryAccrualRows)
		? appsmith.store.salaryAccrualRows
		: [];

		const paymentRows = Array.isArray(appsmith.store?.salaryPaymentRows)
		? appsmith.store.salaryPaymentRows
		: [];

		const accruals_sum = accrualRows
		.filter((row) => !row.deleted_at)
		.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

		const payments_sum = paymentRows
		.filter((row) => !row.deleted_at)
		.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

		const rows = Array.isArray(appsmith.store?.salaryEmployeeRows)
		? appsmith.store.salaryEmployeeRows
		: [];

		const nextRows = rows.map((row) =>
															String(row.id) === String(officeTermId)
															? {
			...row,
			accruals_sum,
			payments_sum,
			balance: accruals_sum - payments_sum
		}
															: row
														 );

		await storeValue("salaryEmployeeRows", nextRows, false);
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

		if (appsmith.store?.SelectedOfficeTerm?.id) {
			await utils.reloadSalaryContext({ refreshEmployees: true });
		} else {
			await utils.getOfficeTerms();
		}

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