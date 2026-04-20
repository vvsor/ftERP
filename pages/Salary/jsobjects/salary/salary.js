export default {
	/// ================== test block ==================
	// async test(){
	// console.log(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
	// },
	/// ============== end of test block ===============

	async tbl_employees_onRowSelected() {
		const row = tbl_employees.selectedRow;
		if (!row?.id) {
			return;
		}

		if (appsmith.store?.salaryReady === false) {
			return;
		}

		const current = appsmith.store?.SelectedOfficeTerm;
		if (current?.id === row.id && appsmith.store?.salaryOfPeriod?.id) {
			return;
		}

		await storeValue("salaryReady", false, true);
		await salary.setSelectedOfficeTerm(row);
		await utils.initPeriod();
		const prefetchedSalaryRecord =
					appsmith.store?.salaryByOfficeTermId?.[row.id] || null;

		await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });

	},


	accrualsSummaryTextVisibleEmployees() {
		const tableRows = tbl_employees?.processedTableData ?? tbl_employees?.tableData;
		const rows = Array.isArray(tableRows) ? tableRows : [];
		const total = rows.reduce((s, r) => s + (Number(r.accruals_sum) || 0), 0);
		return `Начислено: ${utils.formatMoneyRu(total)}`;
	},

	paymentsSummaryTextVisibleEmployees() {
		const tableRows = tbl_employees?.processedTableData ?? tbl_employees?.tableData;
		const rows = Array.isArray(tableRows) ? tableRows : [];
		const total = rows.reduce((s, r) => s + (Number(r.payments_sum) || 0), 0);
		return `Выплачено: ${utils.formatMoneyRu(total)}`;
	},


	getPaymentsSummaryPerson() {
		const accruals = tbl_salaryAccruals?.tableData || [];
		const payments = tbl_salaryPayments?.tableData || [];

		const sumByType = (rows, type) =>
		rows.reduce((s, r) =>
								s + (String(r.branch_account_type || "").toUpperCase() === type
										 ? (Number(r.amount) || 0)
										 : 0), 0);

		return {
			cashAccrued: sumByType(accruals, "CASH"),
			cashPaid: sumByType(payments, "CASH"),
			cashlessAccrued: sumByType(accruals, "CASHLESS"),
			cashlessPaid: sumByType(payments, "CASHLESS"),
		};
	},

	accrualsSummaryTextPerson() {
		const s = this.getPaymentsSummaryPerson();
		return (
			`Безнал: ${utils.formatMoneyRu(s.cashlessAccrued)}. ` +
			`Наличными: ${utils.formatMoneyRu(s.cashAccrued)}`
		);
	},

	paymentsSummaryTextPerson() {
		const s = this.getPaymentsSummaryPerson();
		return (
			`Безналично: ${utils.formatMoneyRu(s.cashlessPaid)}. ` +
			`Наличными: ${utils.formatMoneyRu(s.cashPaid)}`
		);
	},


	async setSelectedOfficeTerm(officeTerm){
		return await storeValue("SelectedOfficeTerm", officeTerm, true);
	},

	async setSalaryOfPeriod(salaryRecord){
		return await storeValue("salaryOfPeriod", salaryRecord, true);
	},

	async sel_chooseBranch_OptionChanged() {
		const branchId = sel_chooseBranch.selectedOptionValue ?? "";
		const previousBranchId = appsmith.store?.salarySelectedBranchId ?? "";

		if (previousBranchId === branchId) {
			return;
		}

		await storeValue("salarySelectedBranchId", branchId, true);
		await storeValue("salaryReady", false, true);
		await utils.initPeriod();

		const rows = await utils.getOfficeTerms({ commitToStore: false });
		if (!rows?.length) {
			await removeValue("SelectedOfficeTerm");
			await removeValue("salaryOfPeriod");
			await storeValue("salaryEmployeeRows", [], false);
			await storeValue("salaryPaymentRows", [], false);
			await storeValue("salaryAccrualRows", [], false);
			await storeValue("salaryReady", true, true);
			return;
		}

		const selectedOfficeTerm = rows[0];
		const prefetchedSalaryRecord =
					appsmith.store?.salaryByOfficeTermId?.[selectedOfficeTerm.id] || null;

		await Promise.all([
			storeValue("salaryEmployeeRows", rows, false),
			salary.setSelectedOfficeTerm(selectedOfficeTerm)
		]);

		await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
	},

	async fetchSalaryByMonth(officeTermId, month) {
		const params = {
			collection: "salary",
			fields: "*",
			filter: {
				office_term_id: { id: { _eq: officeTermId } },
				period_month: { _eq: month },
			}
		};

		const res = await items.getItems(params);
		return res.data?.[0] || null;
	},

	async ensureSalaryExists(officeTermId, periodMonth) {
		const existing = await this.fetchSalaryByMonth(officeTermId, periodMonth);
		if (existing) {
			return { salaryRecord: existing, wasCreated: false, previousSalary: null };
		}

		const prevMonth = moment(periodMonth).subtract(1, "month").format("YYYY-MM-01");
		const previousSalary = await this.fetchSalaryByMonth(officeTermId, prevMonth);

		const body = {
			office_term_id: officeTermId,
			period_month: periodMonth,
			total_salary: previousSalary?.total_salary || 0,
			max_cash_advance_percent: previousSalary?.max_cash_advance_percent || 0
		};


		showAlert("Создаем запись зарплаты...", "info");
		await items.createItems({
			collection: "salary",
			body
		});
		showAlert("Запись зарплаты создана.", "success");

		const created = await this.fetchSalaryByMonth(officeTermId, periodMonth);
		if (!created) {
			throw new Error("Salary created but not found on reload");
		}

		return { salaryRecord: created, wasCreated: true, previousSalary };
	},

	async createRecurringAccrualsFromPreviousMonth(previousSalaryId, newSalaryId) {
		if (!previousSalaryId || !newSalaryId) return;

		// защита от дублей: если в новом периоде уже есть начисления, ничего не копируем
		const existingRes = await items.getItems({
			collection: "salary_accruals",
			fields: "id",
			filter: {
				salary_id: { id: { _eq: newSalaryId } },
				deleted_at: { _null: true }
			},
			limit: 1
		});
		if ((existingRes.data || []).length > 0) return;

		const prevRes = await items.getItems({
			collection: "salary_accruals",
			fields: [
				"amount",
				"branch_account_id.id",
				"accrual_type_id.id",
				"accrual_type_id.is_recurring"
			].join(","),
			filter: {
				salary_id: { id: { _eq: previousSalaryId } },
				accrual_type_id: { is_recurring: { _eq: true } },
				deleted_at: { _null: true }
			},
			limit: -1
		});

		const recurring = prevRes.data || [];
		if (recurring.length === 0) return;

		await items.createItems({
			collection: "salary_accruals",
			body: recurring.map((a) => ({
				salary_id: newSalaryId,
				branch_account_id: a.branch_account_id?.id ?? null,
				accrual_type_id: a.accrual_type_id?.id ?? null,
				amount: Number(a.amount) || 0
			}))
		});
	},

	async loadSalary(prefetchedSalaryRecord = null) {
		try {
			const officeTerm = appsmith.store?.SelectedOfficeTerm;
			const periodMonth = utils.getPeriodMonth();

			if (!officeTerm) {
				throw new Error("officeTerm missing");
			}

			if (!periodMonth) {
				showAlert("Период не инициализирован", "warning");
				return;
			}

			const prefetchedOfficeTermId =
						prefetchedSalaryRecord?.office_term_id?.id ?? prefetchedSalaryRecord?.office_term_id;

			const canUsePrefetched =
						prefetchedSalaryRecord?.id &&
						String(prefetchedOfficeTermId) === String(officeTerm.id) &&
						prefetchedSalaryRecord?.period_month === periodMonth;

			const { salaryRecord, wasCreated, previousSalary } = canUsePrefetched
			? { salaryRecord: prefetchedSalaryRecord, wasCreated: false, previousSalary: null }
			: await this.ensureSalaryExists(officeTerm.id, periodMonth);

			if (wasCreated) {
				await this.createRecurringAccrualsFromPreviousMonth(previousSalary?.id, salaryRecord.id);
			}

			return { ...salaryRecord, __wasCreated: wasCreated };
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("loadSalary failed:", error);
			showAlert("Ошибка загрузки/создания зарплаты", "error");
			throw error;
		}
	},

	async initSalary(){
		await storeValue("salaryReady", false, true);

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

		// Only select salary if any employee exist
		try {
			await items.ensureFreshToken();
			await utils.initPeriod();

			const referenceDataPromise = Promise.all([
				utils.getAccrualTypesOptions(),
				utils.getBranchAccountsOptions(),
				utils.getBranches()
			]);

			const data = await utils.getOfficeTerms({ commitToStore: false });

			// Only call tab selection if a task exists
			if (data.length > 0) {
				const selectedOfficeTerm = data[0];
				const prefetchedSalaryRecord =
							appsmith.store?.salaryByOfficeTermId?.[selectedOfficeTerm.id] || null;

				await Promise.all([
					storeValue("salaryEmployeeRows", data, false),
					salary.setSelectedOfficeTerm(selectedOfficeTerm)
				]);

				await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
			} else {
				await removeValue("SelectedOfficeTerm");
				await removeValue("salaryOfPeriod");
				await storeValue("salaryEmployeeRows", [], false);
				await storeValue("salaryPaymentRows", [], false);
				await storeValue("salaryAccrualRows", [], false);
				await storeValue("salaryReady", true, true);
			}

			await referenceDataPromise;
			return;
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading office terms:", error);
		}
	}
}
