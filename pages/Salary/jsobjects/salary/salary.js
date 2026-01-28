export default {
	/// ================== test block ==================
	async test(){
		// return appsmith.store.SelectedOfficeTerm;
		// return salary.loadSalary.data;
	},

	/// ============== end of test block ===============
	async createSalaryPayment() {
		console.log("CHECK payments", tbl_salaryPayments.tableData);
		console.log("CHECK salaryId", appsmith.store.salaryOfPeriod?.id);
		try {
			// --- Валидация ---
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			const amount = Number(inp_paymentSum.text);
			const paymentType = sel_paymentType.selectedOptionValue;
			const branchId = sel_branchPayment?.selectedOptionValue;

			if (!salaryId) {
				showAlert("Нет salaryID", "error");
				return;
			}

			if (!paymentType) {
				showAlert("Не выбран тип выплаты", "error");
				return;
			}

			const needsBranch = !paymentType.startsWith("CASHLESS");

			if (needsBranch && !branchId) {
				showAlert("Не выбран филиал выплаты", "error");
				return;
			}

			if (!amount || amount <= 0) {
				showAlert("Сумма должна быть больше 0", "error");
				return;
			}

			// --- Правило: безнал не требует филиала ---
			// if (paymentType.startsWith("CASHLESS") && branchId) {
			// showAlert("Для безналичной выплаты филиал указывать не нужно", "warning");
			// }

			// ================= БИЗНЕС-ПРОВЕРКИ =================

			// Источник правды — таблица
			const payments = tbl_salaryPayments.tableData || [];

			// Контекст зарплаты
			const salaryRec = appsmith.store?.salaryOfPeriod;
			if (!salaryRec) {
				showAlert("Нет данных по зарплате", "error");
				return;
			}

			// Числа
			const totalSalary = Number(salaryRec.total_salary) || 0;
			const cashlessLimit = Number(salaryRec.cashless_amount) || 0;
			const maxAdvancePercent = Number(salaryRec.max_advance_percent) || 0;
			const amountNum = Number(amount) || 0;

			// Наличная часть зарплаты
			const cashPart = Math.max(totalSalary - cashlessLimit, 0);

			// ===== Агрегация выплат =====
			const sums = payments.reduce((acc, p) => {
				const amt = Number(p.amount) || 0;

				acc.total += amt;

				if (p.type === "CASH_ADVANCE") acc.cashAdvance += amt;
				if (p.type === "CASHLESS_ADVANCE") acc.cashlessAdvance += amt;
				if (p.type === "CASH_FINAL") acc.cashFinal += amt;
				if (p.type === "CASHLESS_FINAL") acc.cashlessFinal += amt;

				return acc;
			}, {
				total: 0,
				cashAdvance: 0,
				cashlessAdvance: 0,
				cashFinal: 0,
				cashlessFinal: 0
			});

			// ===== 1. Уникальность безнала =====
			if (
				paymentType === "CASHLESS_ADVANCE" ||
				paymentType === "CASHLESS_FINAL"
			) {
				const exists = payments.some(p => p.type === paymentType);

				if (exists) {
					const label =
								paymentType === "CASHLESS_ADVANCE"
					? "Безналичный аванс"
					: "Безналичный финальный платёж";

					showAlert(
						`${label} уже существует за этот месяц. Повторная выплата запрещена.`,
						"error"
					);
					return;
				}
			}

			// ===== 2. Лимит наличного аванса (процент от НАЛИЧНОЙ части) =====
			if (paymentType === "CASH_ADVANCE") {
				const maxCashAdvance = (cashPart * maxAdvancePercent) / 100;
				const alreadyCashAdvanced = sums.cashAdvance;

				if (alreadyCashAdvanced + amountNum > maxCashAdvance) {
					showAlert(
						`Превышен лимит наличного аванса.
Наличная часть: ${cashPart}
Лимит (${maxAdvancePercent}%): ${maxCashAdvance}
Уже выдано: ${alreadyCashAdvanced}`,
						"error"
					);
					return;
				}
			}

			// ===== 3. Лимит общей безналичной суммы =====
			if (
				paymentType === "CASHLESS_ADVANCE" ||
				paymentType === "CASHLESS_FINAL"
			) {
				const totalCashless = sums.cashlessAdvance + sums.cashlessFinal;

				if (totalCashless + amountNum > cashlessLimit) {
					showAlert(
						`Превышен лимит безналичных выплат.
Разрешено: ${cashlessLimit}
Уже безналом: ${totalCashless}`,
						"error"
					);
					return;
				}
			}

			// ===== 4. Общий лимит зарплаты =====
			if (sums.total + amountNum > totalSalary) {
				showAlert(
					`Превышение общей суммы выплат.
Зарплата: ${totalSalary}
Уже выплачено: ${sums.total}`,
					"error"
				);
				return;
			}

			// ================= КОНЕЦ БИЗНЕС-ПРОВЕРОК =================

			// --- Формирование записи ---
			const body = {
				salary_id: salaryId,
				branch_id: paymentType.startsWith("CASHLESS") ? null : branchId,
				type: paymentType,
				amount: amount,
				date: new Date().toISOString().split("T")[0] // YYYY-MM-DD
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
			inp_paymentSum.setValue("");
			sel_paymentType.setSelectedOption("");

			return paymentId;

		} catch (err) {
			console.error("createSalaryPayment error:", err);
			showAlert("Ошибка при создании выплаты", "error");
			throw err;
		}
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
				"branch_id.id",
				"branch_id.name",
				"type",
				"amount",
				"date"
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

			return (res.data || []).map(p => ({
				...p,
				type_name: utils.getPaymentTypeName(p.type)
			}));

		} catch (error) {
			console.error("loadSalaryPayments failed:", error);
			showAlert("Ошибка загрузки выплат зарплаты", "error");
			throw error;
		}
	},

	async sel_paymentType_chosenOption() {
		const type = sel_paymentType.selectedOptionValue;
		if (!type) return;

		switch (type) {

			case "CASHLESS_ADVANCE": {
				// Безнал аванс — филиал не нужен
				sel_branchPayment.setDisabled(true);
				const base1 = Number(inp_CashlessAmount.text) || 0;
				inp_paymentSum.setValue(base1 / 2);
				break;
			}

			case "CASHLESS_FINAL": {
				// Безнал остаток — филиал не нужен
				sel_branchPayment.setDisabled(true);
				const base2 = Number(inp_CashlessAmount.text) || 0;
				inp_paymentSum.setValue(base2 / 2);
				break;
			}

			case "BONUS":
				// Бонус — филиал нужен
				sel_branchPayment.setDisabled(false);
				break;

			case "CASH_ADVANCE":
				// Нал аванс — филиал нужен
				sel_branchPayment.setDisabled(false);
				break;

			case "CASH_FINAL":
				// Нал финал — филиал нужен
				sel_branchPayment.setDisabled(false);
				break;

			default:
				// Защита от мусорных значений
				sel_branchPayment.setDisabled(false);
				showAlert(`Неизвестный тип выплаты: ${type}`, "warning");
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
			const selectedDate = dp_periodMonth.selectedDate;

			if (!officeTerm || !selectedDate) {
				throw new Error("officeTerm or selectedDate missing");
			}

			const periodMonth = utils.YM_01day(selectedDate);
			console.log("periodMonth",periodMonth);
			const prevMonth = utils.YM_01day(
				moment(selectedDate)
				.subtract(1, "month")
				.toDate()
			);
			console.log("prevMonth",prevMonth);

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

			return salaryRecord;

		} catch (error) {
			console.error("loadSalary failed:", error);
			showAlert("Ошибка загрузки/создания зарплаты", "error");
			throw error;
		}
	},

	async tbl_employees_onRowSelected() {
		const row = tbl_employees.selectedRow;
		if (!row?.id) {
			return;
		}
		salary.setSelectedOfficeTerm(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
		await salary.loadSalary();
		await salary.loadSalaryPayments();
	},

	async initSalary(){
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
			if (data.length > 0 ) {
				salary.setSelectedOfficeTerm(data[0]);
				await salary.loadSalary();
				await salary.loadSalaryPayments();
			}
			await Promise.all([
				utils.getBranches()
			]);
			return;
		} catch (error) {
			console.error("Error loading office terms:", error);
		}
	}
}
