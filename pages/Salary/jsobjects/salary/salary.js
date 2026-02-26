export default {
	/// ================== test block ==================
	async test(){
	},
	/// ============== end of test block ===============

	getPaymentsSummary() {
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

	accrualsSummaryText() {
		const s = this.getPaymentsSummary();
		return (
			`Начислено безналично: ${utils.formatMoneyRu(s.cashlessAccrued)}\n` +
			`Начислено наличными: ${utils.formatMoneyRu(s.cashAccrued)}`
		);
	},

	paymentsSummaryText() {
		const s = this.getPaymentsSummary();
		return (
			`Выплачено безналично: ${utils.formatMoneyRu(s.cashlessPaid)}\n` +
			`Выплачено наличными: ${utils.formatMoneyRu(s.cashPaid)}`
		);
	},

	// 2do - move to payments
	async loadSalaryPayments(salaryIdParam) {
		try {
			const salaryId =
						salaryIdParam ||
						appsmith.store?.salaryOfPeriod?.id;

			if (!salaryId) {
				throw new Error("salaryId missing in store and params");
			}

			// Fields to fetch
			const Fields = [
				"id",
				"salary_id",
				"amount",
				"payment_date",
				"branch_account_id.id",
				"branch_account_id.name",
				"branch_account_id.type",
			].join(",");

			const params = {
				collection: "salary_payments",
				fields: Fields,
				filter: {
					salary_id: {
						id: { _eq: salaryId }
					}
				}
			};

			const res = await items.getItems(params);

			const rows = res.data ?? [];

			// Важно: возвращаем ПЛОСКИЙ объект
			return rows.map(p => ({
				id: p.id,
				salary_id: p.salary_id,
				amount: p.amount || 0,
				payment_date: p.payment_date,

				// для селектов (editable)
				branch_account_id: p.branch_account_id?.id ?? null,
				branch_account_name: p.branch_account_id?.name ?? "",
				branch_account_type: p.branch_account_id?.type ?? null,
				// // служебное (необязательно)
				// __rowState: {
				// isNew: false,
				// isDirty: false,
				// error: null
				// }
			}));
		} catch (error) {
			console.error("loadSalaryPayments failed:", error);
			showAlert("Ошибка загрузки выплат зарплаты", "error");
			throw error;
		}
	},

	async loadSalaryAccruals(salaryIdParam) {
		try {
			const salaryId =
						salaryIdParam ||
						appsmith.store?.salaryOfPeriod?.id;

			if (!salaryId) {
				throw new Error("salaryId missing in store and params");
			}

			// Fields to fetch
			const Fields = [
				"id",
				"salary_id",
				"branch_account_id.id",
				"branch_account_id.name",
				"branch_account_id.type",
				"accrual_type_id.id",
				"accrual_type_id.name",
				"accrual_type_id.counts_for_salary_total",
				"accrual_type_id.counts_for_cashless_limit",
				"amount"
			].join(",");

			const params = {
				collection: "salary_accruals",
				fields: Fields,
				filter: {
					salary_id: {
						id: { _eq: salaryId }
					}
				}
			};

			const res = await items.getItems(params);
			const rows = res.data ?? [];

			// Важно: возвращаем ПЛОСКИЙ объект
			return rows.map(p => ({
				id: p.id,
				salary_id: p.salary_id,
				amount: p.amount || 0,

				// для селектов (editable)
				branch_account_id: p.branch_account_id?.id ?? null,
				branch_account_name: p.branch_account_id?.name ?? "",
				branch_account_type: p.branch_account_id?.type ?? null,

				accrual_type_id: p.accrual_type_id?.id ?? null,
				accrual_name: p.accrual_type_id?.name ?? "",
				counts_for_salary_total: !!p.accrual_type_id?.counts_for_salary_total,
				counts_for_cashless_limit: !!p.accrual_type_id?.counts_for_cashless_limit,

				// // служебное (необязательно)
				// __rowState: {
				// isNew: false,
				// isDirty: false,
				// error: null
				// }
			}));
		} catch (error) {
			console.error("loadSalaryAccruals failed:", error);
			showAlert("Ошибка загрузки начислений зарплаты", "error");
			throw error;
		}
	},

	setSelectedOfficeTerm(officeTerm){
		storeValue("SelectedOfficeTerm", officeTerm, true);
	},

	setSalaryOfPeriod(salaryRecord){
		storeValue("salaryOfPeriod", salaryRecord, true);
	},

	async sel_chooseBranch_OptionChanged() {
		return await utils.getOfficeTerms()
	},

	// Добавить в jsobjects/salary/salary.js (внутрь export default)

	async fetchSalaryByMonth(officeTermId, month) {
		const params = {
			collection: "salary",
			fields: "*",
			filter: {
				_and: [
					{
						office_term_id: {
							id: { _eq: officeTermId }
						}
					},
					{
						period_month: {
							_eq: month
						}
					}
				]
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
			cashless_amount: previousSalary?.cashless_amount || 0,
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
				salary_id: { id: { _eq: newSalaryId } }
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
				accrual_type_id: { is_recurring: { _eq: true } }
			},
			limit: -1
		});

		const recurring = prevRes.data || [];
		if (recurring.length === 0) return;

		await Promise.all(
			recurring.map((a) =>
										items.createItems({
				collection: "salary_accruals",
				body: {
					salary_id: newSalaryId,
					branch_account_id: a.branch_account_id?.id ?? null,
					accrual_type_id: a.accrual_type_id?.id ?? null,
					amount: Number(a.amount) || 0
				}
			})
									 )
		);
	},

	async loadSalary() {
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

			const { salaryRecord, wasCreated, previousSalary } =
						await this.ensureSalaryExists(officeTerm.id, periodMonth);

			if (wasCreated) {
				await this.createRecurringAccrualsFromPreviousMonth(previousSalary?.id, salaryRecord.id);
			}

			this.setSalaryOfPeriod(salaryRecord);
			await storeValue("salaryReady", true, true);

			return salaryRecord;
		} catch (error) {
			console.error("loadSalary failed:", error);
			showAlert("Ошибка загрузки/создания зарплаты", "error");
			throw error;
		}
	},

	async tbl_employees_onRowSelected() {
		await storeValue("salaryReady", false, true);

		const row = tbl_employees.selectedRow;
		if (!row?.id) {
			return;
		}
		salary.setSelectedOfficeTerm(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
		await utils.initPeriod();
		await utils.reloadSalaryContext();
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
			const data = await utils.getOfficeTerms();
			// Only call tab selection if a task exists
			if (data.length > 0) {
				salary.setSelectedOfficeTerm(data[0]);
				await utils.initPeriod();
				await utils.reloadSalaryContext();
			}
			await Promise.all([
				utils.getAccrualTypesRaw(),
				utils.getAccrualTypesOptions(),
				utils.getBranchAccountsRaw(),
				utils.getBranchAccountsOptions(),
				utils.getBranches()
			]);
			return;
		} catch (error) {
			console.error("Error loading office terms:", error);
		}
	}
}
