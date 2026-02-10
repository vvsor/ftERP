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

	paymentsSummaryText() {
		const accruals = tbl_salaryAccruals?.tableData || [];
		const payments = tbl_salaryPayments?.tableData || [];

		const sumByType = (rows, type) =>
		rows.reduce((s, r) => {
			return s + (String(r.branch_account_type || "").toUpperCase() === type
									? (Number(r.amount) || 0)
									: 0);
		}, 0);

		const cashAccrued = sumByType(accruals, "CASH");
		const cashPaid = sumByType(payments, "CASH");

		const cashlessAccrued = sumByType(accruals, "CASHLESS");
		const cashlessPaid = sumByType(payments, "CASHLESS");

		const text =
					`Безнал: Начислено: ${utils.formatMoneyRu(cashlessAccrued)}, Выплачено: ${utils.formatMoneyRu(cashlessPaid)}.\n` +
					`Нал: Начислено: ${utils.formatMoneyRu(cashAccrued)}, Выплачено: ${utils.formatMoneyRu(cashPaid)}.`;

		return text;
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

	async createSalaryPayment() {
		try {
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			const salaryRec = appsmith.store?.salaryOfPeriod;

			const amountNum = Number(inp_paymentSum.text);
			const branchAccountId = sel_paymentBranchAccount?.selectedOptionValue;
			const paymentDate = dp_paymentDate ? moment(dp_paymentDate).format("YYYY-MM-DD") : null;

			if (!salaryId) return showAlert("Нет salaryID", "error");
			if (!salaryRec) return showAlert("Нет данных salaryOfPeriod", "error");
			if (!paymentDate) return showAlert("Не выбрана дата", "error");
			if (!branchAccountId) return showAlert("Не выбран счет филиала", "error");
			if (!amountNum || amountNum <= 0) return showAlert("Сумма должна быть больше 0", "error");

			// ====== 0) Получаем тип счета (CASH / CASHLESS / ...)
			const baRes = await items.getItems({
				collection: "branch_accounts",
				fields: ["id", "name", "type"].join(","),
				filter: { id: { _eq: branchAccountId } },
				limit: 1,
			});

			const branchAcc = baRes.data?.[0];
			if (!branchAcc) return showAlert("Счет филиала не найден", "error");

			const isCashAccount = String(branchAcc.type || "").toUpperCase() === "CASH";

			// ====== 1) Начисления по этому счету (с флагами типа начисления)
			const accrRes = await items.getItems({
				collection: "salary_accruals",
				fields: [
					"id",
					"amount",
					"branch_account_id.id",
					"accrual_type_id.id",
					"accrual_type_id.counts_for_salary_total",
					"accrual_type_id.counts_for_cashless_limit",
				].join(","),
				filter: {
					salary_id: { id: { _eq: salaryId } },
					branch_account_id: { id: { _eq: branchAccountId } },
				},
				limit: -1,
			});

			const accruals = accrRes.data ?? [];

			const accrualSum = accruals.reduce((s, a) => s + (Number(a.amount) || 0), 0);

			// База для лимита аванса по наличному счету
			const advanceBaseSum = accruals.reduce((s, a) => {
				const t = a.accrual_type_id;
				const ok =
							t?.counts_for_salary_total === true &&
							t?.counts_for_cashless_limit === false;
				return s + (ok ? (Number(a.amount) || 0) : 0);
			}, 0);

			// ====== 2) Уже выплачено по этому счету
			const payRes = await items.getItems({
				collection: "salary_payments",
				fields: ["id", "amount", "branch_account_id.id"].join(","),
				filter: {
					salary_id: { id: { _eq: salaryId } },
					branch_account_id: { id: { _eq: branchAccountId } },
				},
				limit: -1,
			});

			const payments = payRes.data ?? [];
			const paidSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

			const remaining = accrualSum - paidSum;

			// ====== (1) Запрет превышения выплат относительно начислений по счету
			const EPS = 0.0001;
			if (amountNum > remaining + EPS) {
				return showAlert(
					`Превышение выплат по счету "${branchAcc.name}".\n` +
					`Начислено: ${accrualSum}\nУже выплачено: ${paidSum}\nОстаток: ${remaining}\n` +
					`Пытаетесь выплатить: ${amountNum}`,
					"error"
				);
			}

			// ====== (2) Лимит аванса по наличному счету
			// "Аванс" = выплата меньше остатка (т.е. не закрывает счет полностью)
			const isAdvancePayment = amountNum < (remaining - EPS);

			if (isCashAccount && isAdvancePayment) {
				const maxPctRaw = salaryRec.max_cash_advance_percent;
				const maxPct = Number(maxPctRaw);

				// (C) если процент не задан / не число / 0 => аванс запрещён
				if (!Number.isFinite(maxPct) || maxPct <= 0) {
					return showAlert(
						"Аванс по наличному счету запрещён: не задан salary.max_cash_advance_percent (или он равен 0).",
						"error"
					);
				}

				const maxAdvance = (advanceBaseSum * maxPct) / 100;

				if (paidSum + amountNum > maxAdvance + EPS) {
					return showAlert(
						`Превышен лимит аванса по наличному счету.\n` +
						`База (counts_for_salary_total=true и counts_for_cashless_limit=false): ${advanceBaseSum}\n` +
						`Лимит (${maxPct}%): ${maxAdvance}\n` +
						`Уже выплачено по счету: ${paidSum}\n` +
						`Пытаетесь выплатить: ${amountNum}`,
						"error"
					);
				}
			}

			// ====== Создание записи выплаты
			const body = {
				salary_id: salaryId,
				branch_account_id: branchAccountId,
				amount: amountNum,
				payment_date: paymentDate,
			};

			showAlert("Создаем выплату...", "info");

			const result = await items.createItems({
				collection: "salary_payments",
				body,
			});

			const paymentId = result?.data?.id;

			showAlert(`Выплата создана (ID: ${paymentId})`, "success");

			// Обновление UI
			await utils.reloadSalaryContext();

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
			await utils.reloadSalaryContext();

			sel_accrualType.setSelectedOption("");
			sel_accrualBranchAccount.setSelectedOption("");
			inp_accrualSum.setValue("");

			return accrualId;

		} catch (err) {
			console.error("createSalaryAccrual error:", err);
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
				utils.getAccrualTypes(),
				utils.getBranchAccounts(),
				utils.getBranches()
			]);
			return;
		} catch (error) {
			console.error("Error loading office terms:", error);
		}
	}
}
