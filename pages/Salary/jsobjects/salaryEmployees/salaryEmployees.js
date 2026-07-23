export default {
	getSelectedEmployeeRowIndex() {
		const rows = Array.isArray(appsmith.store?.salaryEmployeeRows) ? appsmith.store.salaryEmployeeRows : [];
		const selectedId = appsmith.store?.SelectedOfficeTerm?.id;

		if (!rows.length) return -1;
		if (!selectedId) return 0;

		const index = rows.findIndex((row) => String(row.id) === String(selectedId));
		return index >= 0 ? index : 0;
	},

	async tbl_employees_onRowSelected() {
		const row = tbl_employees.selectedRow;
		if (!row?.id) return;

		if (appsmith.store?.salaryCreateInProgress === true) {
			resetWidget("tbl_employees", true);
			return;
		}

		if (appsmith.store?.salaryReady === false) return;

		const current = appsmith.store?.SelectedOfficeTerm;
		const isEmployeeChanged =
					current?.id && String(current.id) !== String(row.id);

		if (isEmployeeChanged) {
			await Promise.all([
				tbl_salaryAccruals.isAddRowInProgress
				? resetWidget("tbl_salaryAccruals", true)
				: Promise.resolve(),
				tbl_salaryPayments.isAddRowInProgress
				? resetWidget("tbl_salaryPayments", true)
				: Promise.resolve()
			]);
		}
		if (current?.id === row.id && appsmith.store?.salaryOfPeriod?.id) return;

		await storeValue("salaryReady", false, true);
		await salary.setSelectedOfficeTerm(row);
		await salaryPeriod.initPeriod();

		const prefetchedSalaryRecord = appsmith.store?.salaryByOfficeTermId?.[row.id] || null;
		await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
	},

	async sel_chooseBranch_OptionChanged() {
		const branchId = sel_chooseBranch.selectedOptionValue ?? "";
		const previousBranchId = appsmith.store?.salarySelectedBranchId ?? "";

		if (previousBranchId === branchId) return;

		await storeValue("salarySelectedBranchId", branchId, true);
		await storeValue("salaryReady", false, true);
		await salaryPeriod.initPeriod();
		await salaryAccounts.refreshBranchAccountAccessOptions();

		const rows = await utils.getOfficeTerms({ commitToStore: false });
		if (!rows?.length) {
			await removeValue("SelectedOfficeTerm");
			await removeValue("salaryOfPeriod");
			await storeValue("salaryEmployeeRows", [], false);
			await storeValue("salaryPaymentRows", [], false);
			await storeValue("salaryAccrualRows", [], false);
			await storeValue("salaryReady", true, true);
			return;
		}

		const selectedOfficeTerm = rows[0];
		const prefetchedSalaryRecord = appsmith.store?.salaryByOfficeTermId?.[selectedOfficeTerm.id] || null;

		await Promise.all([
			storeValue("salaryEmployeeRows", rows, false),
			salary.setSelectedOfficeTerm(selectedOfficeTerm)
		]);

		await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
	}
}