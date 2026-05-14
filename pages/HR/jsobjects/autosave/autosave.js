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
		const position = appsmith.store?.hrSelectedPosition;
		const officeTermId = position?.office_term_id;

		if (!officeTermId) {
			console.warn("Autosave skipped: office_term_id not ready", { fieldName });
			return;
		}

		try {
			const value =
						widget && "text" in widget
			? widget.text
			: widget && "selectedOptionValue" in widget
			? widget.selectedOptionValue
			: null;

			if (value === null || value === undefined) return;

			const currentValue = position?.[fieldName] ?? "";
			if (String(value ?? "") === String(currentValue ?? "")) return;

			await items.updateItems({
				collection: "office_terms",
				body: {
					keys: [officeTermId],
					data: { [fieldName]: value }
				}
			});

			const updatedPosition = { ...position, [fieldName]: value };
			await storeValue("hrSelectedPosition", updatedPosition, true);

			const rows = (appsmith.store?.hrPositionRows || []).map((row) =>
																															String(row.office_term_id) === String(officeTermId)
																															? { ...row, [fieldName]: value }
																															: row
																														 );
			await storeValue("hrPositionRows", rows, false);

			if (updatedPosition.user_id) {
				await utils.getOfficeTermHistoryByUser(updatedPosition.user_id);
			}
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