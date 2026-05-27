export default {
	/// ================== test block ==================
	// async test(){
	// console.log(tbl_employees.tableData[tbl_employees.selectedRowIndex]);
	// },
	/// ============== end of test block ===============


	async setSelectedOfficeTerm(officeTerm){
		return await storeValue("SelectedOfficeTerm", officeTerm, true);
	},

	async setSalaryOfPeriod(salaryRecord){
		return await storeValue("salaryOfPeriod", salaryRecord, true);
	},

	async fetchSalaryByMonth(officeTermId, month) {
		const params = {
			collection: "salary",
			fields: "id,office_term_id.id,period_month,total_salary,max_cash_advance_percent,comment",
			filter: {
				office_term_id: { id: { _eq: officeTermId } },
				period_month: { _eq: month },
			}
		};

		const res = await items.getItems(params);
		return res.data?.[0] || null;
	},

	async ensureSalaryExists(officeTermId, periodMonth) {
		const existing = await this.fetchSalaryByMonth(officeTermId, periodMonth);
		if (existing) {
			return { salaryRecord: existing, wasCreated: false, previousSalary: null };
		}

		await storeValue("salaryCreateInProgress", true, false);

		const prevMonth = moment(periodMonth).subtract(1, "month").format("YYYY-MM-01");
		const previousSalary = await this.fetchSalaryByMonth(officeTermId, prevMonth);

		const body = {
			office_term_id: officeTermId,
			period_month: periodMonth,
			total_salary: previousSalary?.total_salary || 0,
			max_cash_advance_percent: previousSalary?.max_cash_advance_percent || 0
		};


		showAlert("Создаем запись зарплаты...", "info");
		await items.createItems({
			collection: "salary",
			body
		});
		showAlert("Запись зарплаты создана.", "success");

		const created = await this.fetchSalaryByMonth(officeTermId, periodMonth);
		if (!created) {
			throw new Error("Salary created but not found on reload");
		}

		return { salaryRecord: created, wasCreated: true, previousSalary };
	},

	async getOrCreateSalaryForCurrentSelection() {
		const officeTerm = appsmith.store?.SelectedOfficeTerm;
		const periodMonth = salaryPeriod.getPeriodMonth();

		if (!officeTerm?.id) {
			throw new Error("officeTerm missing");
		}

		if (!periodMonth) {
			throw new Error("periodMonth missing");
		}

		const { salaryRecord, wasCreated, previousSalary } =
					await this.ensureSalaryExists(officeTerm.id, periodMonth);

		if (wasCreated) {
			await this.createRecurringAccrualsFromPreviousMonth(previousSalary?.id, salaryRecord.id);
		}

		const nextSalaryRecord = { ...salaryRecord, __wasCreated: wasCreated };
		await this.setSalaryOfPeriod(nextSalaryRecord);

		if (wasCreated) {
			const rows = await utils.getOfficeTerms({ commitToStore: false });
			await storeValue("salaryEmployeeRows", rows, false);
		}

		return nextSalaryRecord;
	},

	async createRecurringAccrualsFromPreviousMonth(previousSalaryId, newSalaryId) {
		if (!previousSalaryId || !newSalaryId) return;

		// защита от дублей: если в новом периоде уже есть начисления, ничего не копируем
		const existingRes = await items.getItems({
			collection: "salary_accruals",
			fields: "id",
			filter: {
				salary_id: { id: { _eq: newSalaryId } },
				deleted_at: { _null: true }
			},
			limit: 1
		});
		if ((existingRes.data || []).length > 0) return;

		const prevRes = await items.getItems({
			collection: "salary_accruals",
			fields: [
				"amount",
				"branch_account_id.id",
				"accrual_type_id.id",
				"accrual_type_id.is_recurring"
			].join(","),
			filter: {
				salary_id: { id: { _eq: previousSalaryId } },
				accrual_type_id: { is_recurring: { _eq: true } },
				deleted_at: { _null: true }
			},
			limit: -1
		});

		const recurring = prevRes.data || [];
		if (recurring.length === 0) return;

		await items.createItems({
			collection: "salary_accruals",
			body: recurring.map((a) => ({
				salary_id: newSalaryId,
				branch_account_id: a.branch_account_id?.id ?? null,
				accrual_type_id: a.accrual_type_id?.id ?? null,
				amount: Number(a.amount) || 0
			}))
		});
	},

	async loadSalary(prefetchedSalaryRecord = null, { createIfMissing = false } = {}) {
		try {
			const officeTerm = appsmith.store?.SelectedOfficeTerm;
			const periodMonth = salaryPeriod.getPeriodMonth();

			if (!officeTerm) {
				throw new Error("officeTerm missing");
			}

			if (!periodMonth) {
				showAlert("Период не инициализирован", "warning");
				return null;
			}

			const prefetchedOfficeTermId =
						prefetchedSalaryRecord?.office_term_id?.id ?? prefetchedSalaryRecord?.office_term_id;

			const canUsePrefetched =
						prefetchedSalaryRecord?.id &&
						String(prefetchedOfficeTermId) === String(officeTerm.id) &&
						prefetchedSalaryRecord?.period_month === periodMonth;

			if (canUsePrefetched) {
				return { ...prefetchedSalaryRecord, __wasCreated: false };
			}

			if (!createIfMissing) {
				const existing = await this.fetchSalaryByMonth(officeTerm.id, periodMonth);
				return existing ? { ...existing, __wasCreated: false } : null;
			}

			return await this.getOrCreateSalaryForCurrentSelection();
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("loadSalary failed:", error);
			showAlert("Ошибка загрузки зарплаты", "error");
			throw error;
		} finally {
			if (appsmith.store?.salaryCreateInProgress === true) {
				await storeValue("salaryCreateInProgress", false, false);
			}
		}
	},
	async initSalary(){
		await storeValue("salaryReady", false, true);

		const user = appsmith.store?.user;
		const isEditMode = appsmith.mode === "EDIT";
		const hasSalaryAccess = await nav.hasPage("salary");

		if (!user?.token) {
			if (isEditMode) {
				showAlert("EDIT: нет токена пользователя, остаёмся на странице Salary без загрузки данных.", "warning");
			} else {
				showAlert("Требуется авторизация. Перенаправление на страницу входа.", "info");
				navigateTo("Auth");
			}

			await storeValue("salaryReady", true, true);
			return;
		}

		if (!hasSalaryAccess) {
			showAlert("Нет доступа к странице Salary.", "warning");

			if (!isEditMode) {
				await storeValue("salaryReady", true, true);
				navigateTo("Auth");
				return;
			}
		}

		// Only select salary if any employee exist
		try {
			await items.ensureFreshToken();
			await salaryPeriod.initPeriod();

			const referenceDataPromise = Promise.all([
				utils.getAccrualTypesOptions(),
				salaryAccounts.refreshBranchAccountAccessOptions(),
				utils.getBranches()
			]);

			const data = await utils.getOfficeTerms({ commitToStore: false });

			// Only call tab selection if a task exists
			if (data.length > 0) {
				const currentId = appsmith.store?.SelectedOfficeTerm?.id;
				const selectedOfficeTerm =
							data.find((row) => String(row.id) === String(currentId)) || data[0];
				const prefetchedSalaryRecord =
							appsmith.store?.salaryByOfficeTermId?.[selectedOfficeTerm.id] || null;

				await Promise.all([
					storeValue("salaryEmployeeRows", data, false),
					salary.setSelectedOfficeTerm(selectedOfficeTerm)
				]);

				await utils.reloadSalaryContext({ salaryRecord: prefetchedSalaryRecord });
			} else {
				await removeValue("SelectedOfficeTerm");
				await removeValue("salaryOfPeriod");
				await storeValue("salaryEmployeeRows", [], false);
				await storeValue("salaryPaymentRows", [], false);
				await storeValue("salaryAccrualRows", [], false);
				await storeValue("salaryReady", true, true);
			}

			await referenceDataPromise;
			return;
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading office terms:", error);
			showAlert("Ошибка загрузки страницы зарплаты", "error");
			await storeValue("salaryReady", true, true);
		}
	}
}