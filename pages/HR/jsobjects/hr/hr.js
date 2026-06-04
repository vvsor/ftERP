export default {
	async initHrStores() {
		const defaults = {
			hrCityRows: [],
			hrBranchRows: [],
			hrActivityAreaRows: [],
			hrFunctionGroupRows: [],
			hrFunctionGroupDutyRows: [],
			hrDutyRows: [],
			hrPositionRows: [],
			hrEmployeeRows: [],
			hrPositionTitleRows: [],
			hrOfficeTermHistoryRows: [],
			hrEmployeeOfficeTermHistoryRows: [],
			hrSelectedFunctionGroupPositionIds: [],
			hrSelectedPositionFunctionGroupIds: [],
			hrSelectedPositionTitleFunctionGroupIds: []
		};

		await Promise.all(
			Object.entries(defaults)
			.filter(([key]) => !Array.isArray(appsmith.store?.[key]))
			.map(([key, value]) => storeValue(key, value, false))
		);

		if (appsmith.store?.hrSelectedActivityAreaId === undefined) {
			await storeValue("hrSelectedActivityAreaId", "", true);
		}

		if (appsmith.store?.hrSelectedFunctionGroup === undefined) {
			await storeValue("hrSelectedFunctionGroup", null, true);
		}

		if (appsmith.store?.hrSelectedPositionTitle === undefined) {
			await storeValue("hrSelectedPositionTitle", null, true);
		}
	},

	async initHR() {
		await this.initHrStores();
		const user = appsmith.store?.user;
		const isEditMode = appsmith.mode === "EDIT";
		const hasHrAccess = await nav.hasPage("hr");

		if (!user?.token) {
			if (isEditMode) {
				showAlert("EDIT: нет токена пользователя, остаёмся на странице HR без загрузки данных.", "warning");
			} else {
				showAlert("Требуется авторизация. Перенаправление на страницу входа.", "info");
				navigateTo("Auth");
			}
			return;
		}

		if (!hasHrAccess) {
			showAlert("Нет доступа к странице HR.", "warning");

			if (!isEditMode) {
				navigateTo("Auth");
				return;
			}
		}

		try {
			await items.ensureFreshToken();
			await utils.loadDictionaries();
			await hrDictionaries.ensureFunctionGroupSelection({ keepSelection: true });
			await utils.getCurrentOfficeTerms();

			const selectedBranchId = appsmith.store?.hrSelectedBranchId ?? "";
			await hrPositions.refreshHrBranch(selectedBranchId, { keepSelection: false });

			const employeeRows = await utils.getEmployees();
			await hrEmployees.refreshSelectedEmployeeHistory(null, employeeRows);
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading HR:", error);
		}
	}
}