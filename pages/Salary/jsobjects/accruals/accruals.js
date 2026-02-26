export default {
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


	async createSalaryAccrual(newRow) {
		const salaryId = appsmith.store?.salaryOfPeriod?.id;
		const body = {
			salary_id: salaryId,
			branch_account_id: newRow.branch_account_name,	// select keeps id in that field
			accrual_type_id: newRow.accrual_name,	// select keeps id in that field
			amount: Number(newRow.amount),
		};
		console.log("raw: ", newRow);
		console.log("body: ", body);

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

		const patch = {};

		if ("amount" in updatedFields) {
			patch.amount = Number(updatedFields.amount);
		}

		// IMPORTANT: Selects return values value (ID)
		// if branch_account_name change -> than it became branch_account_id
		if ("branch_account_name" in updatedFields) {
			patch.branch_account_id = updatedFields.branch_account_name;
		}

		if ("accrual_name" in updatedFields) {
			patch.accrual_type_id = updatedFields.accrual_name;
		}

		// если ничего полезного не поменялось — не дёргаем API
		if (Object.keys(patch).length === 0) return;

		const body = {
			keys: [allFields.id],
			data: patch
		};


		await items.updateItems({
			collection: "salary_accruals",
			body
		});

		await accruals.loadSalaryAccruals();
	},

	async deleteSalaryAccrual () {
		const accrualIdToDelete = tbl_salaryAccruals.triggeredRow.id;
		try {
			await items.deleteItems({
				collection: "salary_accruals",
				body: {
					query: {
						filter: {
							id: { "_eq": accrualIdToDelete }
						}
					}
				}
			})
		} catch (error) {
			// General catch for the entire operation
			console.error("Error during deleting accrual:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
		await accruals.loadSalaryAccruals();
		return;
	}
}