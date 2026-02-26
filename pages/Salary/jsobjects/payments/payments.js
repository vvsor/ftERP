export default {
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
				"comment",
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
				comment: p.comment,

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

	async createSalaryPayment(newRow) {
		try {
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			const salaryRec = appsmith.store?.salaryOfPeriod;

			const amountNum = newRow.amount;
			const branchAccountId = newRow.branch_account_name;
			const paymentDate = newRow.payment_date;
			const comment = newRow.comment;
			//const paymentDate = dp_paymentDate ? moment(dp_paymentDate).format("YYYY-MM-DD") : null;

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
			// const isAdvancePayment = amountNum < (remaining - EPS);
			// 
			// if (isCashAccount && isAdvancePayment) {
			// const maxPctRaw = salaryRec.max_cash_advance_percent;
			// const maxPct = Number(maxPctRaw);
			// 
			// // (C) если процент не задан / не число / 0 => аванс запрещён
			// if (!Number.isFinite(maxPct) || maxPct <= 0) {
			// return showAlert(
			// "Аванс по наличному счету запрещён: не задан salary.max_cash_advance_percent (или он равен 0).",
			// "error"
			// );
			// }
			// 
			// const maxAdvance = (advanceBaseSum * maxPct) / 100;
			// 
			// if (paidSum + amountNum > maxAdvance + EPS) {
			// return showAlert(
			// `Превышен лимит аванса по наличному счету.\n` +
			// `База (counts_for_salary_total=true и counts_for_cashless_limit=false): ${advanceBaseSum}\n` +
			// `Лимит (${maxPct}%): ${maxAdvance}\n` +
			// `Уже выплачено по счету: ${paidSum}\n` +
			// `Пытаетесь выплатить: ${amountNum}`,
			// "error"
			// );
			// }
			// }

			// ====== Создание записи выплаты
			const body = {
				salary_id: salaryId,
				branch_account_id: branchAccountId,
				amount: amountNum,
				payment_date: paymentDate,
				comment: comment
			};

			showAlert("Создаем выплату...", "info");

			const result = await items.createItems({
				collection: "salary_payments",
				body,
			});

			const paymentId = result?.data?.id;

			showAlert(`Выплата создана (ID: ${paymentId})`, "success");

			// Обновление UI
			await payments.loadSalaryPayments();

			return paymentId;

		} catch (err) {
			console.error("createSalaryPayment error:", err);
			showAlert("Ошибка при создании выплаты", "error");
			throw err;
		}
	},

	async updateSalaryPayment(changed) {
		const { allFields, updatedFields } = changed;
		const salaryId = appsmith.store?.salaryOfPeriod?.id;

		const patch = {};

		if ("amount" in updatedFields) {
			patch.amount = Number(updatedFields.amount);
		}

		// IMPORTANT: Selects return values value (ID)
		// if branch_account_name change -> than it became branch_account_id
		if ("branch_account_name" in updatedFields) {
			patch.branch_account_id = updatedFields.branch_account_name;
		}

		if ("payment_date" in updatedFields) {
			patch.payment_date = updatedFields.payment_date;
		}

		if ("comment" in updatedFields) {
			patch.comment = updatedFields.comment;
		}

		// exit without changes
		if (Object.keys(patch).length === 0) return;

		const body = {
			keys: [allFields.id],
			data: patch
		};


		await items.updateItems({
			collection: "salary_payments",
			body
		});

		await payments.loadSalaryPayments();
	},

	async deleteSalaryPayment () {
		const paymentIdToDelete = tbl_salaryPayments.triggeredRow.id;
		try {
			await items.deleteItems({
				collection: "salary_payments",
				body: {
					query: {
						filter: {
							id: { "_eq": paymentIdToDelete }
						}
					}
				}
			})
		} catch (error) {
			// General catch for the entire operation
			console.error("Error during deleting payment:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
		await payments.loadSalaryPayments();
		return;
	}
}