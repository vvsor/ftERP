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

	// ================== UTILS ==================
getPeriodMonth() {
  return appsmith.store.periodMonth || null;
},

	extractValue(widget) {
		if (!widget) return null;

		// Input, TextArea
		if ("text" in widget) return widget.text;

		// Select, Dropdown
		if ("selectedOptionValue" in widget) {
			return widget.selectedOptionValue;
		}

		throw new Error("Unsupported widget type");
	},

	// ================== CORE SAVE ==================
	async saveField(fieldName, widget) {
		try {
						
			const keys = [salary.loadSalary.data[0].id];
			const value = this.extractValue(widget);

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

			showAlert(`${fieldName} autosaved`, "success");
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