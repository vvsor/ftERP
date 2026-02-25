export default {

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

		await salary.loadSalaryAccruals();
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

		await salary.loadSalaryAccruals();
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
		await salary.loadSalaryAccruals();
		return;
	}
}