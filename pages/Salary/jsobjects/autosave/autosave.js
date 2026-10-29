export default {
	// ================== CONFIG ==================
	DEBOUNCE_DELAY: 2000,
	debouncedSaveFn: null,
	activeSaves: 0,

	// ================== DEBOUNCE ==================
	debounce(func, delay) {
		let timeoutId;
		return (...args) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => func(...args), delay);
		};
	},

	// ================== CORE SAVE ==================
	async saveField(fieldName, widget, context) {
		const isCurrent = () => context?.officeTermId &&
					String(appsmith.store?.SelectedOfficeTerm?.id) === String(context.officeTermId) &&
					appsmith.store?.periodMonth === context.periodMonth &&
					!salaryEmployees.selectionInProgress;
		if (!isCurrent()) return;

		if (!appsmith.store?.salaryReady) {
			console.warn("Autosave blocked: salary not ready");
			return;
		}
		this.activeSaves += 1;
		let requestedSalaryCreation = false;

		try {
			let salaryRec = appsmith.store?.salaryOfPeriod;
			const value = utils.extractValue(widget);

			if (value === null || value === undefined) {
				console.warn("Autosave skipped: empty value", fieldName);
				return;
			}

			if (!salaryRec?.id) {
				if (String(value ?? "").trim() === "") {
					console.warn("Autosave skipped: empty value without salary", fieldName);
					return;
				}
				requestedSalaryCreation = true;
				salaryRec = await salary.getOrCreateSalaryForCurrentSelection();
			}

			const currentValue = salaryRec?.[fieldName] ?? "";
			if (String(value ?? "") === String(currentValue ?? "")) {
				return;
			}

			const keys = [salaryRec.id];

			const body = {
				keys,
				data: {
					[fieldName]: value
				}
			};

			const params = {
				collection: "salary",
				body
			};

			await items.updateItems(params);
			if (!isCurrent()) return;
			await salary.setSalaryOfPeriod({
				...appsmith.store.salaryOfPeriod,
				[fieldName]: value
			});

		} catch (err) {
			console.error(`Autosave failed for ${fieldName}:`, err);
			showAlert(`Autosave failed: ${fieldName}`, "warning");
		} finally {
			try {
				if (requestedSalaryCreation) {
					await storeValue("salaryCreateInProgress", false, false);
				}
			} finally {
				this.activeSaves -= 1;
			}
		}
	},

	// ================== PUBLIC API ==================
	initAutosave() {
		if (!this.debouncedSaveFn) {
			this.debouncedSaveFn = this.debounce(
				this.saveField.bind(this),
				this.DEBOUNCE_DELAY
			);
		}
	},

	autosave(widget, fieldName) {
		if (!this.debouncedSaveFn) {
			this.initAutosave();
		}

		if (appsmith.store?.salaryReady !== true || salaryEmployees.selectionInProgress) return;

		const context = {
			officeTermId: appsmith.store?.SelectedOfficeTerm?.id,
			periodMonth: appsmith.store?.periodMonth
		};
		const snapshot = { text: utils.extractValue(widget) };
		this.debouncedSaveFn(fieldName, snapshot, context);
	}
}