export default {
	/// ================== test block ==================
	async test(){
		// return appsmith.store.SelectedOfficeTerm;
		// return salary.loadSalary.data;
		// moment.locale("ru");
		// return moment.locale();
		// inp_accrualSum.setValue("");
	},

	/// ============== end of test block ===============

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
				amount: p.amount,
				payment_date: p.payment_date,

				// для селектов (editable)
				branch_account_id: p.branch_account_id?.id ?? null,
				branch_account_name: p.branch_account_id?.name ?? "",

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

	async createSalaryPayment() {
		try {
			// --- Валидация ---
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			const amount = Number(inp_paymentSum.text);
			const branchAccountId = sel_paymentBranchAccount?.selectedOptionValue;
			const paymentDate = dp_paymentDate ? moment(dp_paymentDate).format("YYYY-MM-DD") : null;

			if (!salaryId) {
				showAlert("Нет salaryID", "error");
				return;
			}

			if (!paymentDate) {
				showAlert("Не выбрана дата", "error");
				return;
			}

			if (!branchAccountId) {
				showAlert("Не выбран счет филиала", "error");
				return;
			}

			if (!amount || amount <= 0) {
				showAlert("Сумма должна быть больше 0", "error");
				return;
			}

			// --- Формирование записи ---
			const body = {
				salary_id: salaryId,
				branch_account_id: branchAccountId,
				amount: amount,
				payment_date: paymentDate
			};

			const params = {
				collection: "salary_payments",
				body: body
			};

			// --- Создание ---
			showAlert("Создаем выплату...", "info");
			const result = await items.createItems(params);

			const paymentId = result.data.id;

			showAlert(`Выплата создана (ID: ${paymentId})`, "success");
			// --- Обновление UI ---
			await salary.loadSalaryPayments();
			sel_paymentBranchAccount.setSelectedOption("");
			inp_paymentSum.setValue("");			

			return paymentId;

		} catch (err) {
			console.error("createSalaryPayment error:", err);
			showAlert("Ошибка при создании выплаты", "error");
			throw err;
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
				"accrual_type_id.id",
				"accrual_type_id.name",
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
				amount: p.amount,

				// для селектов (editable)
				branch_account_id: p.branch_account_id?.id ?? null,
				branch_account_name: p.branch_account_id?.name ?? "",

				accrual_type_id: p.accrual_type_id?.id ?? null,
				accrual_name: p.accrual_type_id?.name ?? "",

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

	async createSalaryAccrual() {
		try {
			// --- Валидация ---
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			const amount = Number(inp_accrualSum.text);
			const accrualType = sel_accrualType?.selectedOptionValue;
			const branchAccountId = sel_accrualBranchAccount?.selectedOptionValue;

			if (!salaryId) {
				showAlert("Нет salaryID", "error");
				return;
			}

			if (!accrualType) {
				showAlert("Не выбран тип начисления", "error");
				return;
			}

			if (!branchAccountId) {
				showAlert("Не выбран счет филиала", "error");
				return;
			}

			if (!amount || amount <= 0) {
				showAlert("Сумма должна быть больше 0", "error");
				return;
			}

			// --- Формирование записи ---
			const body = {
				salary_id: salaryId,
				branch_account_id: branchAccountId,
				accrual_type_id: accrualType,
				amount: amount
			};

			const params = {
				collection: "salary_accruals",
				body: body
			};

			// --- Создание ---
			showAlert("Создаем начисление...", "info");
			const result = await items.createItems(params);

			const accrualId = result.data.id;

			showAlert(`Начисление создано (ID: ${accrualId})`, "success");
			// --- Обновление UI ---
			await salary.loadSalaryAccruals();
			sel_accrualType.setSelectedOption("");
			sel_accrualBranchAccount.setSelectedOption("");
			inp_accrualSum.setValue("");

			return accrualId;

		} catch (err) {
			console.error("createSalaryPayment error:", err);
			showAlert("Ошибка при создании начисления", "error");
			throw err;
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
					max_advance_percent: previous?.max_advance_percent || 0
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
		await salary.loadSalary();
		await salary.loadSalaryPayments();
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
				await salary.loadSalary();
				await salary.loadSalaryPayments();
				await salary.loadSalaryAccruals();
			}
			await Promise.all([
				utils.getAccrualTypes(),
				utils.getBranchAccounts()
			]);
			return;
		} catch (error) {
			console.error("Error loading office terms:", error);
		}
	}
}
