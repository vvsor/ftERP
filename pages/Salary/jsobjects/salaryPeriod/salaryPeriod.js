export default {
	shiftPeriodPromise: null,

	async initPeriod() {
		if (!appsmith.store.periodMonth) {
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, "0");
			const periodMonth = `${year}-${month}-01`;
			await storeValue("periodMonth", periodMonth, true);
			return periodMonth;
		}
		return appsmith.store.periodMonth;
	},

	async shiftPeriod(monthOffset = 0) {
		if (this.shiftPeriodPromise) return await this.shiftPeriodPromise;

		this.shiftPeriodPromise = (async () => {
			await storeValue("salaryPeriodShiftInProgress", true, false);
			await storeValue("salaryReady", false, true);

			try {
				const base = moment(appsmith.store.periodMonth || undefined);
				const nextPeriod = (base.isValid() ? base : moment())
					.clone()
					.add(monthOffset, "month")
					.startOf("month")
					.format("YYYY-MM-DD");

				await storeValue("periodMonth", nextPeriod, true);

				const rows = await utils.getOfficeTerms({ commitToStore: false });
				if (!rows.length) {
					await removeValue("SelectedOfficeTerm");
					await removeValue("salaryOfPeriod");
					await storeValue("salaryEmployeeRows", [], false);
					await storeValue("salaryPaymentRows", [], false);
					await storeValue("salaryAccrualRows", [], false);
					await storeValue("salaryReady", true, true);
					return nextPeriod;
				}

				const currentId = appsmith.store?.SelectedOfficeTerm?.id;
				const selectedOfficeTerm = rows.find((row) => String(row.id) === String(currentId)) || rows[0];
				const prefetchedSalaryRecord = appsmith.store?.salaryByOfficeTermId?.[selectedOfficeTerm.id] || null;

				await Promise.all([
					storeValue("salaryEmployeeRows", rows, false),
					salary.setSelectedOfficeTerm(selectedOfficeTerm)
				]);

				await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
				return nextPeriod;
			} catch (error) {
				if (error?.authHandled) throw error;
				console.error("shiftPeriod failed:", error);
				showAlert("Ошибка переключения периода", "error");
				throw error;
			} finally {
				await storeValue("salaryPeriodShiftInProgress", false, false);
				if (appsmith.store?.salaryReady !== true) {
					await storeValue("salaryReady", true, true);
				}
				this.shiftPeriodPromise = null;
			}
		})();

		return await this.shiftPeriodPromise;
	},

	getPeriodMonth() {
		return appsmith.store.periodMonth || null;
	}
}