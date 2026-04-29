export default {
	/// ================== test block ==================
	// async test(){
	// console.log(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
	// },
	/// ============== end of test block ===============

	async tbl_employees_onRowSelected() {
		const row = tbl_positions.selectedRow;
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
		await hr.setSelectedOfficeTerm(row);
	},

	async setSelectedOfficeTerm(officeTerm){
		return await storeValue("SelectedOfficeTerm", officeTerm, true);
	},

	async initHR(){
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

		// Only select positions if any exist
		try {
			await items.ensureFreshToken();

			const referenceDataPromise = Promise.all([
				utils.getBranches()
			]);

			const data = await utils.getOfficeTerms({ commitToStore: false });

			if (data.length > 0) {
				const selectedOfficeTerm = data[0];

				await Promise.all([
					hr.setSelectedOfficeTerm(selectedOfficeTerm)
				]);

			} else {
				await removeValue("SelectedOfficeTerm");
			}

			await referenceDataPromise;
			return;
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading office terms:", error);
		}
	}
}
