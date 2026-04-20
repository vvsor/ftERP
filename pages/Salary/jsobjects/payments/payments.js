export default {
	DELETE_CONFIRM_WINDOW_MS: 5000,

	async loadSalaryPayments(salaryIdParam, { commitToStore = true } = {}) {
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
				"deleted_at",
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
					},
					...(sw_deletedPayments.isSwitchedOn ? {} : { deleted_at: { _null: true } })
				}
			};

			const res = await items.getItems(params);

			const rows = res.data ?? [];

			// Важно: возвращаем ПЛОСКИЙ объект
			const flatRows = rows.map(p => ({
				id: p.id,
				salary_id: p.salary_id,
				amount: p.amount || 0,
				payment_date: p.payment_date,
				comment: p.comment,
				deleted_at: p.deleted_at,

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
			if (commitToStore) {
				await storeValue("salaryPaymentRows", flatRows, false);
			}
			return flatRows;
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("loadSalaryPayments failed:", error);
			showAlert("Ошибка загрузки выплат зарплаты", "error");
			throw error;
		}
	},

	async createSalaryPayment(newRow) {
		const fail = (msg) => {
			const err = new Error(msg);
			err.userFacing = true;
			showAlert(msg, "error");
			throw err;
		};
		try {
			const salaryId = appsmith.store?.salaryOfPeriod?.id;
			if (!salaryId) fail("Зарплата периода не выбрана");
			// const salaryRec = appsmith.store?.salaryOfPeriod;


			// const amountNum = Number(newRow.amount);
			// 
			// if (!Number.isFinite(amountNum) || amountNum <= 0) {
			// showAlert("Ошибочная сумма выплаты", "error");
			// throw new Error("Invalid payment amount");
			// }

			const toCents = (v) => Math.round(Number(v) * 100);
			const amountCents = toCents(newRow.amount);
			if (!Number.isInteger(amountCents) || amountCents <= 0) {
				fail("Ошибочная сумма выплаты");
			}
			const amountNum = amountCents / 100;

			const branchAccountId = newRow.branch_account_name;
			const paymentDate = newRow.payment_date;
			const comment = newRow.comment;

			if (!branchAccountId) fail("Выберите счет филиала");
			if (!paymentDate) fail("Укажите дату выплаты");
			//const paymentDate = dp_paymentDate ? moment(dp_paymentDate).format("YYYY-MM-DD") : null;

			// ====== 0) Получаем тип счета (CASH / CASHLESS / ...)
			const baRes = await items.getItems({
				collection: "branch_accounts",
				fields: ["id", "name", "type"].join(","),
				filter: { id: { _eq: branchAccountId } },
				limit: 1,
			});

			const branchAcc = baRes.data?.[0];
			if (!branchAcc) fail("Счет филиала не найден");

			// const isCashAccount = String(branchAcc.type || "").toUpperCase() === "CASH";

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
					deleted_at: { _null: true }
				},
				limit: -1,
			});

			const accruals = accrRes.data ?? [];

			const accrualSum = accruals.reduce((s, a) => s + (Number(a.amount) || 0), 0);

			// База для лимита аванса по наличному счету
			// const advanceBaseSum = accruals.reduce((s, a) => {
			// const t = a.accrual_type_id;
			// const ok =
			// t?.counts_for_salary_total === true &&
			// t?.counts_for_cashless_limit === false;
			// return s + (ok ? (Number(a.amount) || 0) : 0);
			// }, 0);

			// ====== 2) Уже выплачено по этому счету
			const payRes = await items.getItems({
				collection: "salary_payments",
				fields: ["id", "amount", "branch_account_id.id"].join(","),
				filter: {
					salary_id: { id: { _eq: salaryId } },
					branch_account_id: { id: { _eq: branchAccountId } },
					deleted_at: { _null: true }
				},
				limit: -1,
			});

			const paymentsRows = payRes.data ?? [];
			const paidSum = paymentsRows.reduce((s, p) => s + (Number(p.amount) || 0), 0);

			const remaining = accrualSum - paidSum;

			// ====== (1) Запрет превышения выплат относительно начислений по счету
			const EPS = 0.0001;
			if (amountNum > remaining + EPS) {
				fail(
					`Превышение выплат по счету "${branchAcc.name}".\n` +
					`Начислено: ${accrualSum}\nУже выплачено: ${paidSum}\nОстаток: ${remaining}\n` +
					`Пытаетесь выплатить: ${amountNum}`
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
			await utils.refreshSelectedEmployeeSummaryFromDetails();

			return paymentId;
		} catch (err) {
			if (err?.authHandled) throw err;
			if (err?.userFacing) throw err;
			console.error("createSalaryPayment error:", err);
			showAlert("Ошибка при создании выплаты", "error");
			throw err;
		}
	},

	async updateSalaryPayment(changed) {
		const { allFields, updatedFields } = changed;
		const salaryId = appsmith.store?.salaryOfPeriod?.id;
		const paymentId = allFields.id;

		const patch = {};

		if ("amount" in updatedFields) {
			patch.amount = Number(updatedFields.amount);
		}

		// Select returns id in branch_account_name field
		if ("branch_account_name" in updatedFields) {
			patch.branch_account_id = updatedFields.branch_account_name;
		}

		if ("payment_date" in updatedFields) {
			patch.payment_date = updatedFields.payment_date;
		}

		if ("comment" in updatedFields) {
			patch.comment = updatedFields.comment;
		}

		// No meaningful changes
		if (Object.keys(patch).length === 0) return;

		// Final values after edit
		const nextAmount = "amount" in patch ? Number(patch.amount) : Number(allFields.amount);
		const nextBranchAccountId =
					"branch_account_id" in patch ? patch.branch_account_id : (allFields.branch_account_id || allFields.branch_account_name);
		const nextPaymentDate =
					"payment_date" in patch ? patch.payment_date : allFields.payment_date;

		if (!salaryId) {
			showAlert("Зарплата периода не выбрана", "error");
			throw new Error("salaryId missing");
		}

		if (!nextBranchAccountId) {
			showAlert("Выберите счет филиала", "error");
			throw new Error("Branch account is required");
		}

		if (!nextPaymentDate) {
			showAlert("Укажите дату выплаты", "error");
			throw new Error("Payment date is required");
		}

		if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
			showAlert("Ошибочная сумма выплаты", "error");
			throw new Error("Invalid payment amount");
		}

		// Sum accruals for target account (active only)
		const accrRes = await items.getItems({
			collection: "salary_accruals",
			fields: "id,amount",
			filter: {
				salary_id: { id: { _eq: salaryId } },
				branch_account_id: { id: { _eq: nextBranchAccountId } },
				deleted_at: { _null: true }
			},
			limit: -1
		});
		const accrualSum = (accrRes.data || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);

		// Sum other payments for same account (exclude current payment)
		const payRes = await items.getItems({
			collection: "salary_payments",
			fields: "id,amount",
			filter: {
				_and: [
					{ salary_id: { id: { _eq: salaryId } } },
					{ branch_account_id: { id: { _eq: nextBranchAccountId } } },
					{ deleted_at: { _null: true } },
					{ id: { _neq: paymentId } }
				]
			},
			limit: -1
		});
		const otherPaidSum = (payRes.data || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

		// Do not allow payments to exceed accruals after edit
		const EPS = 0.0001;
		if (otherPaidSum + nextAmount > accrualSum + EPS) {
			showAlert(
				`Выплата превышает начисления по данному счету.\n` +
				`Начислено: ${accrualSum}\n` +
				`Уже выплачено (excluding edited row): ${otherPaidSum}\n` +
				`Попытка выплатить: ${nextAmount}`,
				"error"
			);
			throw new Error("Выплата превышает начисление");
		}

		await items.updateItems({
			collection: "salary_payments",
			body: {
				keys: [paymentId],
				data: patch
			}
		});

		await payments.loadSalaryPayments();
		await utils.refreshSelectedEmployeeSummaryFromDetails();
	},

	async deleteSalaryPayment () {
		const paymentIdToDelete = tbl_salaryPayments.triggeredRow.id;
		const now = Date.now();
		const pending = appsmith.store?.pendingDeleteSalaryPayment;

		if (
			pending?.id !== paymentIdToDelete ||
			!pending?.ts ||
			now - pending.ts > this.DELETE_CONFIRM_WINDOW_MS
		) {
			await storeValue("pendingDeleteSalaryPayment", {
				id: paymentIdToDelete,
				ts: now
			});
			showAlert("Нажмите удалить еще раз в течение 5 секунд для подтверждения", "warning");
			return;
		}

		await removeValue("pendingDeleteSalaryPayment");
		try {
			await items.updateItems({
				collection: "salary_payments",
				body: {
					keys: [paymentIdToDelete],
					data: { deleted_at: new Date().toISOString() }
				}
			});
		} catch (error) {
			// General catch for the entire operation
			console.error("Ошибка при удалении выплаты:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
		await payments.loadSalaryPayments();
		await utils.refreshSelectedEmployeeSummaryFromDetails();
		return;
	}
}