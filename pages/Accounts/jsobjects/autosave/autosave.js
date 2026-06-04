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
	async saveField(fieldName, widget, target = "position") {
		const isFunctionGroup = target === "functionGroup";
		const record = isFunctionGroup ? appsmith.store?.hrSelectedFunctionGroup : appsmith.store?.hrSelectedPosition;
		const recordId = record?.id;

		if (!recordId) {
			console.warn("Autosave skipped: record id not ready", { fieldName, target });
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

			const currentValue = record?.[fieldName] ?? "";
			if (String(value ?? "") === String(currentValue ?? "")) return;

			const collection = isFunctionGroup ? "function_groups" : "positions";
			const storeKey = isFunctionGroup ? "hrSelectedFunctionGroup" : "hrSelectedPosition";
			const rowsKey = isFunctionGroup ? "hrFunctionGroupRows" : "hrPositionRows";

			await items.updateItems({
				collection,
				body: {
					keys: [recordId],
					data: { [fieldName]: value }
				}
			});

			const updatedRecord = { ...record, [fieldName]: value };
			await storeValue(storeKey, updatedRecord, true);

			const rows = (appsmith.store?.[rowsKey] || []).map((row) =>
																												 String(row.id) === String(recordId)
																												 ? { ...row, [fieldName]: value }
																												 : row
																												);
			await storeValue(rowsKey, rows, false);
			
			if (isFunctionGroup && fieldName === "description") {
				const refreshedRows = await utils.getFunctionGroupRows();
				const refreshedRecord = refreshedRows.find((row) => String(row.id) === String(recordId)) || updatedRecord;
				await storeValue(storeKey, refreshedRecord, true);
				showAlert("Описание функционала сохранено", "success");
			}
		} catch (err) {
			console.error(`Autosave failed for ${target}.${fieldName}:`, err);
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

	autosave(widget, fieldName, target = "position") {
		if (!this.debouncedSaveFn) {
			this.initAutosave();
		}

		this.debouncedSaveFn(fieldName, widget, target);
	}
}