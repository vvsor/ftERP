export default {
	async createSalaryPayment() {
		try {
			// --- Валидация ---
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			const amount = Number(inp_paymentSum.text);
			const paymentType = sel_paymentType.selectedOptionValue;
			const branchId = sel_branchAccount?.selectedOptionValue;

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
			const payments = tbl_salaryAccruals.tableData || [];

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
}