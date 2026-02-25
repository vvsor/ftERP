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

			const prevMonth = moment(periodMonth)
			.subtract(1, "month")
			.format("YYYY-MM-01");

			// ================= helpers =================

			const fetchSalary = async (month) => {
				const params = {
					collection: "salary",
					fields: "*",
					filter: {
						_and: [
							{
								office_term_id: {
									id: { _eq: officeTerm.id }
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
			};

			const createSalary = async (body) => {
				const params = {
					collection: "salary",
					body: body
				};

				showAlert("Создаем запись зарплаты...", "info");
				await items.createItems(params);
				showAlert("Запись зарплаты созадна.", "success");
			};

			// ================= main flow =================

			// 1. Пробуем получить текущий
			let salaryRecord = await fetchSalary(periodMonth);

			// 2. Если нет — берем прошлый и создаем новый
			if (!salaryRecord) {
				const previous = await fetchSalary(prevMonth);

				const body = {
					office_term_id: officeTerm.id,
					period_month: periodMonth,
					total_salary: previous?.total_salary || 0,
					cashless_amount: previous?.cashless_amount || 0,
					max_cash_advance_percent: previous?.max_cash_advance_percent || 0
				};

				await createSalary(body);

				// 3. Перечитываем
				salaryRecord = await fetchSalary(periodMonth);

				if (!salaryRecord) {
					throw new Error("Salary created but not found on reload");
				}
			}

			// 4. ВСЕГДА сохраняем в store
			salary.setSalaryOfPeriod(salaryRecord);

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
