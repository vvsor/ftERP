export default {
	/// ================== test block ==================
	// test: async () => {
	// removeValue("periodMonth");
	// // const now = new Date();
	// // 
	// // console.log("initPeriod(): now: ", now.toISOString());
	// // const firstDay = new Date(
	// // now.getFullYear(),
	// // now.getMonth(),
	// // 1
	// // );
	// // console.log("initPeriod(): firstDay: ", firstDay.toISOString());
	// const now = new Date();
	// 
	// const y = now.getFullYear();
	// const m = String(now.getMonth() + 1).padStart(2, "0");
	// 
	// const iso = `${y}-${m}-01`;   // БЕЗ UTC СДВИГА
	// await storeValue("periodMonth", iso, true);
	// 
	// return iso;
	// },
	/// ============== end of test block ===============

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

	toLocalYMD(date) {
		const d = new Date(date);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		return `${y}-${m}-01`;
	},

	YM_01day(date) {
		const d = new Date(date);
		d.setDate(1);
		return d.toISOString().slice(0, 10);
	},

	async getAccrualTypesRaw() {
		const response = await items.getItems({
			collection: "salary_accrual_types",
			fields: "id,name",
			limit: -1
		});

		return (response.data || [])
			.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	},

	async getAccrualTypesOptions() {
		const rows = await this.getAccrualTypesRaw();

		return rows.map((x) => ({
			label: x.name,
			value: x.id,
		}));
	},

	async getSalaryByOfficeTermId(officeTerms = [], periodMonth) {
		const officeTermIds = officeTerms.map((term) => term.id).filter(Boolean);
		if (!periodMonth || officeTermIds.length === 0) return {};

		const response = await items.getItems({
			collection: "salary",
			fields: "id,office_term_id.id,period_month,total_salary,max_cash_advance_percent,comment",
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
		const period = moment(periodMonth || undefined);
		const periodStart = period.isValid()
		? period.clone().startOf("month").format("YYYY-MM-DD")
		: moment().startOf("month").format("YYYY-MM-DD");
		const periodEnd = period.isValid()
		? period.clone().endOf("month").format("YYYY-MM-DD")
		: moment().endOf("month").format("YYYY-MM-DD");

		const officeFilter = {
			_and: [
				...(branchId ? [{ position_id: { branch_id: { id: { _eq: branchId } } } }] : []),
				{ date_from: { _lte: periodEnd } },
				{ _or: [{ date_till: { _null: true } }, { date_till: { _gte: periodStart } }] }
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
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

		if (commitToStore) {
			await storeValue("salaryBranchRows", rows, true);
		}

		return rows;
	},

	async getBranchAccountsRaw() {
		const response = await items.getItems({
			collection: "branch_accounts",
			fields: "id,name,type",
			limit: -1
		});

		return (response.data || [])
			.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
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
		const base = moment(appsmith.store.periodMonth || undefined);
		const nextPeriod = (base.isValid() ? base : moment())
		.clone()
		.add(monthOffset, "month")
		.startOf("month")
		.format("YYYY-MM-DD");

		await storeValue("periodMonth", nextPeriod, true);
		await storeValue("salaryReady", false, true);

		const rows = await utils.getOfficeTerms({ commitToStore: false });
		if (!rows.length) {
			await removeValue("SelectedOfficeTerm");
			await removeValue("salaryOfPeriod");
			await storeValue("salaryEmployeeRows", [], false);
			await storeValue("salaryPaymentRows", [], false);
			await storeValue("salaryAccrualRows", [], false);
			await storeValue("salaryReady", true, true);
			return nextPeriod;
		}

		const currentId = appsmith.store?.SelectedOfficeTerm?.id;
		const selectedOfficeTerm =
					rows.find((row) => String(row.id) === String(currentId)) || rows[0];
		const prefetchedSalaryRecord =
					appsmith.store?.salaryByOfficeTermId?.[selectedOfficeTerm.id] || null;

		await Promise.all([
			storeValue("salaryEmployeeRows", rows, false),
			salary.setSelectedOfficeTerm(selectedOfficeTerm)
		]);

		await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
		return nextPeriod;
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