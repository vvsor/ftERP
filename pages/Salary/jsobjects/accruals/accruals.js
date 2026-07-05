export default {
	DELETE_CONFIRM_WINDOW_MS: 5000,

	async loadSalaryAccruals(salaryIdParam, { commitToStore = true } = {}) {
		try {
			const salaryId =
						salaryIdParam ||
						appsmith.store?.salaryOfPeriod?.id;

			if (!salaryId) {
				if (commitToStore) {
					await storeValue("salaryAccrualRows", [], false);
				}
				return [];
			}

			const accountRows = await salaryAccounts.getBranchAccountsRaw({
				accessField: "accruals_access",
				allowed: ["read", "write"]
			});
			const accountIds = accountRows.map((row) => row.id).filter(Boolean);

			if (!accountIds.length) {
				if (commitToStore) await storeValue("salaryAccrualRows", [], false);
				return [];
			}

			const Fields = [
				"id",
				"salary_id",
				"amount",
				"comment",
				"deleted_at",
				"branch_account_id.id",
				"branch_account_id.name",
				"branch_account_id.type",
				"branch_account_id.date_deleted",
				"accrual_type_id.id",
				"accrual_type_id.name",
				"accrual_type_id.counts_for_salary_total",
				"accrual_type_id.counts_for_cashless_limit"
			].join(",");

			const params = {
				collection: "salary_accruals",
				fields: Fields,
				filter: {
					_and: [
						{ salary_id: { id: { _eq: salaryId } } },
						{ branch_account_id: { id: { _in: accountIds } } },
						{ branch_account_id: { date_deleted: { _null: true } } },
						...(sw_deletedAccruals.isSwitchedOn ? [] : [{ deleted_at: { _null: true } }])
					]
				}
			};

			const res = await items.getItems(params);
			const rows = res.data ?? [];

			// Важно: возвращаем ПЛОСКИЙ объект
			const flatRows = rows.map(p => ({
				id: p.id,
				salary_id: p.salary_id,
				amount: p.amount || 0,
				comment: p.comment,
				deleted_at: p.deleted_at,

				// для селектов (editable)
				branch_account_id: p.branch_account_id?.id ?? null,
				branch_account_name: p.branch_account_id?.id ?? null,
				branch_account_type: p.branch_account_id?.type ?? null,

				accrual_type_id: p.accrual_type_id?.id ?? null,
				accrual_name: p.accrual_type_id?.id ?? null,
				counts_for_salary_total: !!p.accrual_type_id?.counts_for_salary_total,
				counts_for_cashless_limit: !!p.accrual_type_id?.counts_for_cashless_limit
			}));
			if (commitToStore) {
				await storeValue("salaryAccrualRows", flatRows, false);
			}
			return flatRows;
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("loadSalaryAccruals failed:", error);
			showAlert("Ошибка загрузки начислений зарплаты", "error");
			throw error;
		}
	},

	async createSalaryAccrual(newRow) {
		const fail = (msg) => {
			const err = new Error(msg);
			err.userFacing = true;
			showAlert(msg, "error");
			throw err;
		};

		try {
			const branchAccountId = newRow.branch_account_name;
			const accrualTypeId = newRow.accrual_name;
			const amount = Number(newRow.amount);
			const comment = newRow.comment;

			if (!branchAccountId) fail("Выберите счет филиала");

			if (!salaryAccounts.hasBranchAccountWriteAccess(branchAccountId, "salaryAccrualWriteBranchAccountIds")) {
				fail("Нет права записи по выбранному счету начислений");
			}

			if (!accrualTypeId) fail("Выберите тип начисления");

			if (!Number.isFinite(amount) || amount <= 0) {
				fail("Ошибочная сумма начисления");
			}

			const salaryRecord = appsmith.store?.salaryOfPeriod?.id
			? appsmith.store.salaryOfPeriod
			: await salary.getOrCreateSalaryForCurrentSelection();
			const salaryId = salaryRecord?.id;

			if (!salaryId) fail("Не удалось создать запись зарплаты");

			const result = await items.createItems({
				collection: "salary_accruals",
				body: {
					salary_id: salaryId,
					branch_account_id: branchAccountId,
					accrual_type_id: accrualTypeId,
					comment,
					amount
				}
			});

			await accruals.loadSalaryAccruals();
			await utils.refreshSelectedEmployeeSummaryFromDetails();

			return result.data?.id;
		} catch (err) {
			if (err?.authHandled) throw err;
			if (err?.userFacing) return null;

			console.error("createSalaryAccrual error:", err);
			showAlert("Ошибка при создании начисления", "error");
			throw err;
		}
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

		const nextAccrualTypeId =
					"accrual_type_id" in patch ? patch.accrual_type_id : (allFields.accrual_type_id || allFields.accrual_name);

		if (!salaryId) {
			showAlert("Зарплата периода не выбрана", "error");
			return null;
		}

		if (!newAccountId) {
			showAlert("Выберите счет филиала", "error");
			return null;
		}

		if (!salaryAccounts.hasBranchAccountWriteAccess(newAccountId, "salaryAccrualWriteBranchAccountIds")) {
			showAlert("Нет права записи по выбранному счету начислений", "error");
			return null;
		}

		if (!nextAccrualTypeId) {
			showAlert("Выберите тип начисления", "error");
			return null;
		}

		if (!Number.isFinite(newAmount) || newAmount <= 0) {
			showAlert("Ошибочная сумма начисления", "error");
			return null;
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
				return null;
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
				return null;
			}

			if (newPaid > newAfterEdit + EPS) {
				showAlert("Невозможно изменить начисление: существующие выплаты превышают начисления по счету (НЕВОЗМОЖНАЯ СИТУАЦИЯ)", "error");
				return null;
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
		await utils.refreshSelectedEmployeeSummaryFromDetails();
	},

	async deleteSalaryAccrual() {
		const row = tbl_salaryAccruals.triggeredRow;
		const accrualIdToDelete = row.id;

		const branchAccountId = row.branch_account_id || row.branch_account_name;

		if (!salaryAccounts.hasBranchAccountWriteAccess(branchAccountId, "salaryAccrualWriteBranchAccountIds")) {
			showAlert("Нет права записи по выбранному счету начислений", "error");
			return null;
		}

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
			showAlert("Невозможно удалить данное начисление: существуют выплаты по данному счету в этом периоде.", "error");
			return null;
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
		await utils.refreshSelectedEmployeeSummaryFromDetails();
	}

}