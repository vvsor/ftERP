export default {
	// ================== CONFIG ==================
	DEBOUNCE_DELAY: 2000,
	debouncedSaveFns: {},

	// ================== DEBOUNCE ==================
	debounce(func, delay) {
		let timeoutId;
		return (...args) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => func(...args), delay);
		};
	},

	// ================== CORE SAVE ==================
	async saveField(fieldName, value, target = "position", recordId = null) {
		const isFunctionGroup = target === "functionGroup";

		if (!recordId) {
			console.warn("Autosave skipped: record id not ready", { fieldName, target });
			return;
		}

		try {
			if (value === null || value === undefined) return;

			const collection = isFunctionGroup ? "function_groups" : "positions";
			const storeKey = isFunctionGroup ? "hrSelectedFunctionGroup" : "hrSelectedPosition";
			const rowsKey = isFunctionGroup ? "hrFunctionGroupRows" : "hrPositionRows";
			const currentRows = Array.isArray(appsmith.store?.[rowsKey]) ? appsmith.store[rowsKey] : [];
			const selectedRecord = appsmith.store?.[storeKey];
			const currentRecord =
						currentRows.find((row) => String(row.id) === String(recordId)) ||
						(String(selectedRecord?.id) === String(recordId) ? selectedRecord : null);

			if (currentRecord && String(value ?? "") === String(currentRecord[fieldName] ?? "")) return;

			await items.updateItems({
				collection,
				body: {
					keys: [recordId],
					data: { [fieldName]: value }
				}
			});

			const rows = (appsmith.store?.[rowsKey] || []).map((row) =>
																												 String(row.id) === String(recordId)
																												 ? { ...row, [fieldName]: value }
																												 : row
																												);
			await storeValue(rowsKey, rows, false);

			const currentSelectedRecord = appsmith.store?.[storeKey];
			if (String(currentSelectedRecord?.id) === String(recordId)) {
				await storeValue(storeKey, { ...currentSelectedRecord, [fieldName]: value }, true);
			}

			if (isFunctionGroup && fieldName === "description") {
				const refreshedRows = await hrDictionaries.getFunctionGroupRows();
				const selectedAfterRefresh = appsmith.store?.[storeKey];

				if (String(selectedAfterRefresh?.id) === String(recordId)) {
					const refreshedRecord =
								refreshedRows.find((row) => String(row.id) === String(recordId)) ||
								selectedAfterRefresh;
					await storeValue(storeKey, refreshedRecord, true);
				}

				showAlert("Описание функционала сохранено", "success");
			}
		} catch (err) {
			console.error(`Autosave failed for ${target}.${fieldName}:`, err);
			showAlert(`Autosave failed: ${fieldName}`, "warning");
		}
	},

	// ================== PUBLIC API ==================
	autosave(widget, fieldName, target = "position") {
		const isFunctionGroup = target === "functionGroup";
		const record = isFunctionGroup
		? appsmith.store?.hrSelectedFunctionGroup
		: appsmith.store?.hrSelectedPosition;
		const recordId = record?.id || null;
		const value =
					widget && "text" in widget
		? widget.text
		: widget && "selectedOptionValue" in widget
		? widget.selectedOptionValue
		: null;

		if (!recordId) {
			console.warn("Autosave skipped: record id not ready", { fieldName, target });
			return;
		}
		if (value === null || value === undefined) return;

		const debounceKey = [target, recordId, fieldName].join(":");
		if (!this.debouncedSaveFns[debounceKey]) {
			this.debouncedSaveFns[debounceKey] = this.debounce(
				(nextValue) => this.saveField(fieldName, nextValue, target, recordId),
				this.DEBOUNCE_DELAY
			);
		}

		this.debouncedSaveFns[debounceKey](value);
	}
}