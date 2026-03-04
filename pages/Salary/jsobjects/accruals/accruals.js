export default {
	DELETE_CONFIRM_WINDOW_MS: 5000,

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
				"amount",
				"comment",
				"deleted_at",
				"branch_account_id.id",
				"branch_account_id.name",
				"branch_account_id.type",
				"accrual_type_id.id",
				"accrual_type_id.name",
				"accrual_type_id.counts_for_salary_total",
				"accrual_type_id.counts_for_cashless_limit"
			].join(",");

			const params = {
				collection: "salary_accruals",
				fields: Fields,
				filter: {
					salary_id:
					{
						id: { _eq: salaryId }
					},
					...(sw_deletedAccruals.isSwitchedOn ? {} : { deleted_at: { _null: true } } )
				}
			};

			const res = await items.getItems(params);
			const rows = res.data ?? [];

			// Важно: возвращаем ПЛОСКИЙ объект
			return rows.map(p => ({
				id: p.id,
				salary_id: p.salary_id,
				amount: p.amount || 0,
				comment: p.comment,
				deleted_at: p.deleted_at,

				// для селектов (editable)
				branch_account_id: p.branch_account_id?.id ?? null,
				branch_account_name: p.branch_account_id?.name ?? "",
				branch_account_type: p.branch_account_id?.type ?? null,

				accrual_type_id: p.accrual_type_id?.id ?? null,
				accrual_name: p.accrual_type_id?.name ?? "",
				counts_for_salary_total: !!p.accrual_type_id?.counts_for_salary_total,
				counts_for_cashless_limit: !!p.accrual_type_id?.counts_for_cashless_limit
			}));
		} catch (error) {
			console.error("loadSalaryAccruals failed:", error);
			showAlert("Ошибка загрузки начислений зарплаты", "error");
			throw error;
		}
	},

	async createSalaryAccrual(newRow) {
		const salaryId = appsmith.store?.salaryOfPeriod?.id;
		const body = {
			salary_id: salaryId,
			branch_account_id: newRow.branch_account_name,	// select keeps id in that field
			accrual_type_id: newRow.accrual_name,	// select keeps id in that field
			comment: newRow.comment,	// select keeps id in that field
			amount: Number(newRow.amount),
		};

		const result = await items.createItems({
			collection: "salary_accruals",
			body
		});

		await accruals.loadSalaryAccruals();
		return result.data?.id;
	},

	async updateSalaryAccrual(changed) {
		const { allFields, updatedFields } = changed;
		const salaryId = appsmith.store?.salaryOfPeriod?.id;
		const accrualId = allFields.id;
		const EPS = 0.0001;

		const patch = {};

		if ("amount" in updatedFields) {
			patch.amount = Number(updatedFields.amount);
		}

		// Select returns id in branch_account_name
		if ("branch_account_name" in updatedFields) {
			patch.branch_account_id = updatedFields.branch_account_name;
		}

		if ("accrual_name" in updatedFields) {
			patch.accrual_type_id = updatedFields.accrual_name;
		}

		if ("comment" in updatedFields) {
			patch.comment = updatedFields.comment;
		}

		if (Object.keys(patch).length === 0) return;

		const oldAccountId = allFields.branch_account_id || allFields.branch_account_name;
		const newAccountId =
					"branch_account_id" in patch ? patch.branch_account_id : oldAccountId;

		const oldAmount = Number(allFields.amount) || 0;
		const newAmount = "amount" in patch ? Number(patch.amount) : oldAmount;

		if (!Number.isFinite(newAmount) || newAmount < 0) {
			showAlert("Accrual amount is invalid", "error");
			throw new Error("Ошибочная сумма начисления");
		}

		const getPaidSum = async (branchAccountId) => {
			const res = await items.getItems({
				collection: "salary_payments",
				fields: "id,amount",
				filter: {
					salary_id: { id: { _eq: salaryId } },
					branch_account_id: { id: { _eq: branchAccountId } },
					deleted_at: { _null: true }
				},
				limit: -1
			});
			return (res.data || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
		};

		const getAccrualSumExcludingCurrent = async (branchAccountId) => {
			const res = await items.getItems({
				collection: "salary_accruals",
				fields: "id,amount",
				filter: {
					_and: [
						{ salary_id: { id: { _eq: salaryId } } },
						{ branch_account_id: { id: { _eq: branchAccountId } } },
						{ deleted_at: { _null: true } },
						{ id: { _neq: accrualId } }
					]
				},
				limit: -1
			});
			return (res.data || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
		};

		if (oldAccountId === newAccountId) {
			const [paid, accrualsWithoutCurrent] = await Promise.all([
				getPaidSum(newAccountId),
				getAccrualSumExcludingCurrent(newAccountId)
			]);

			const accrualAfterEdit = accrualsWithoutCurrent + newAmount;
			if (paid > accrualAfterEdit + EPS) {
				showAlert("Невозможно сохранить начисление: выплаты превышают начисления по данному счету", "error");
				throw new Error("Редактирование начисления заблокировано существующими выплатами");
			}
		} else {
			const [
				oldPaid,
				oldAccrualsWithoutCurrent,
				newPaid,
				newAccrualsWithoutCurrent
			] = await Promise.all([
				getPaidSum(oldAccountId),
				getAccrualSumExcludingCurrent(oldAccountId),
				getPaidSum(newAccountId),
				getAccrualSumExcludingCurrent(newAccountId)
			]);

			const oldAfterEdit = oldAccrualsWithoutCurrent; // current accrual removed from old account
			const newAfterEdit = newAccrualsWithoutCurrent + newAmount; // current accrual added to new account

			if (oldPaid > oldAfterEdit + EPS) {
				showAlert("Невозможно изменить начисление: существующие выплаты превышают начисления по счету", "error");
				throw new Error("Изменение начисления заблокировано существующими выплатами");
			}

			if (newPaid > newAfterEdit + EPS) {
				showAlert("Невозможно изменить начисление: существующие выплаты превышают начисления по счету (НЕВОЗМОЖНАЯ СИТУАЦИЯ)", "error");
				throw new Error("Изменение начисления заблокировано");
			}
		}

		await items.updateItems({
			collection: "salary_accruals",
			body: {
				keys: [accrualId],
				data: patch
			}
		});

		await accruals.loadSalaryAccruals();
	},

	async deleteSalaryAccrual() {
		const row = tbl_salaryAccruals.triggeredRow;
		const accrualIdToDelete = row.id;


		const now = Date.now();
		const pending = appsmith.store?.pendingDeleteSalaryAccrual;

		if (
			pending?.id !== accrualIdToDelete ||
			!pending?.ts ||
			now - pending.ts > this.DELETE_CONFIRM_WINDOW_MS
		) {
			await storeValue("pendingDeleteSalaryAccrual", {
				id: accrualIdToDelete,
				ts: now
			});
			showAlert("Нажмите удалить еще раз в течение 5 секунд для подтверждения", "warning");
			return;
		}

		await removeValue("pendingDeleteSalaryAccrual");


		const salaryId = appsmith.store?.salaryOfPeriod?.id;
		const branchAccountId = row.branch_account_id || row.branch_account_name;
		const amountToDelete = Number(row.amount) || 0;
		const EPS = 0.0001;

		// 1) Sum active accruals for this salary + account
		const accrRes = await items.getItems({
			collection: "salary_accruals",
			fields: "id,amount",
			filter: {
				salary_id: { id: { _eq: salaryId } },
				branch_account_id: { id: { _eq: branchAccountId } },
				deleted_at: { _null: true }
			},
			limit: -1
		});
		const accrualSum = (accrRes.data || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
		const accrualAfterDelete = accrualSum - amountToDelete;

		// 2) Sum active payments for this salary + account
		const payRes = await items.getItems({
			collection: "salary_payments",
			fields: "id,amount",
			filter: {
				salary_id: { id: { _eq: salaryId } },
				branch_account_id: { id: { _eq: branchAccountId } },
				deleted_at: { _null: true }
			},
			limit: -1
		});
		const paidSum = (payRes.data || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);

		// 3) Block deletion if payments would exceed accruals after delete
		if (paidSum > accrualAfterDelete + EPS) {
			showAlert(
				"Невозможно удалить данное начисление: существуют выплаты по данному счету в этом периоде.",
				"error"
			);
			throw new Error("Удаление заблокировано существующими выплатами");
		}

		// 4) Soft delete
		await items.updateItems({
			collection: "salary_accruals",
			body: {
				keys: [accrualIdToDelete],
				data: { deleted_at: new Date().toISOString() }
			}
		});

		await accruals.loadSalaryAccruals();
	}

}