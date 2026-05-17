export default {
	// ================== CONFIG ==================
	DEBOUNCE_DELAY: 2000,
	debouncedSaveFn: null,

	// ================== DEBOUNCE ==================
	debounce(func, delay) {
		let timeoutId;
		return (...args) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => func(...args), delay);
		};
	},

	// ================== CORE SAVE ==================
	async saveField(fieldName, widget) {
		if (!appsmith.store?.salaryReady) {
			console.warn("Autosave blocked: salary not ready");
			return;
		}
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
			await salary.setSalaryOfPeriod({
				...salaryRec,
				[fieldName]: value
			});

		} catch (err) {
			console.error(`Autosave failed for ${fieldName}:`, err);
			showAlert(`Autosave failed: ${fieldName}`, "warning");
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

		this.debouncedSaveFn(fieldName, widget);
	}
}