export default {
	/// ================== test block ==================
	// async test(){
	// console.log(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
	// },
	/// ============== end of test block ===============

	async tbl_employees_onRowSelected() {
		const row = tbl_employees.selectedRow;
		if (!row?.id) {
			return;
		}

		if (appsmith.store?.salaryReady === false) {
			return;
		}

		const current = appsmith.store?.SelectedOfficeTerm;
		if (current?.id === row.id && appsmith.store?.salaryOfPeriod?.id) {
			return;
		}

		await storeValue("salaryReady", false, true);
		await admin.setSelectedOfficeTerm(row);
	},

	async setSelectedOfficeTerm(officeTerm){
		return await storeValue("SelectedOfficeTerm", officeTerm, true);
	},

	async initAdmin(){
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
			await items.ensureFreshToken();

			const referenceDataPromise = Promise.all([
				utils.getBranches()
			]);

			const data = await utils.getOfficeTerms({ commitToStore: false });

			// Only call tab selection if a task exists
			if (data.length > 0) {
				const selectedOfficeTerm = data[0];

				await Promise.all([
					storeValue("salaryEmployeeRows", data, false),
					admin.setSelectedOfficeTerm(selectedOfficeTerm)
				]);

			} else {
				await removeValue("SelectedOfficeTerm");
				await removeValue("salaryOfPeriod");
				await storeValue("salaryEmployeeRows", [], false);
			}

			await referenceDataPromise;
			return;
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading office terms:", error);
		}
	}
}
