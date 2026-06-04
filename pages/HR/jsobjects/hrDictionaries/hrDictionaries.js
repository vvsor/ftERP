export default {
	syncFunctionGroupPositionsRunning: false,
	syncFunctionGroupPositionsQueued: null,

	async loadDictionaries() {
		await Promise.all([
			hrEmployees.getRoles(),
			hrDictionaries.getPositionTitleRows(),
			hrDictionaries.getCityRows(),
			hrDictionaries.getBranches(),
			hrEmployees.getPolicies(),
			hrDictionaries.getActivityAreaRows(),
			hrDictionaries.getFunctionGroupRows(),
			utils.getDutyRows()
		]);
	},

	async getBranches({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "branches",
			fields: "id,name,city_id.id,city_id.name",
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => ({
			id: row.id,
			name: row.name || "",
			city_id: row.city_id?.id ?? row.city_id ?? null,
			city: row.city_id?.name || ""
		}))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

		if (commitToStore) await storeValue("hrBranchRows", rows, true);
		return rows;
	},

	async getCityRows() {
		const response = await items.getItems({
			collection: "cities",
			fields: "id,name",
			limit: -1
		});

		const rows = (response.data || [])
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

		await storeValue("hrCityRows", rows, false);
		return rows;
	},

	async getPositionTitleRows() {
		const response = await items.getItems({
			collection: "position_titles",
			fields: "id,title",
			limit: -1
		});

		const rows = (response.data || [])
		.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

		await storeValue("hrPositionTitleRows", rows, false);
		return rows;
	},

	async getActivityAreaRows({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "activity_areas",
			fields: "id,name",
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => ({ id: row.id, name: row.name || "" }))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

		if (commitToStore) await storeValue("hrActivityAreaRows", rows, false);
		return rows;
	},

	getPositionTitleOptions() {
		const rows = Array.isArray(appsmith.store?.hrPositionTitleRows) ? appsmith.store.hrPositionTitleRows : [];
		return rows.map((row) => ({ label: row.title || row.id, value: row.id }));
	},

	async getFunctionGroupRows({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "function_groups",
			fields: "*,activity_area_id.id,activity_area_id.name",
			limit: -1
		});

		const sortLevel = (value) => Number.isFinite(Number(value)) ? Number(value) : 999999;
		const rows = (response.data || [])
		.map((row) => {
			const activityAreaId = row.activity_area_id?.id ?? row.activity_area_id ?? null;
			const normalized = {
				id: row.id,
				name: row.name || "",
				activity_area_id: activityAreaId,
				activity_area_name: row.activity_area_id?.name || "",
				level: row.level ?? null
			};

			if (Object.prototype.hasOwnProperty.call(row, "description")) {
				normalized.description = row.description || "";
			}

			return normalized;
		})
		.sort((a, b) =>
					sortLevel(a.level) - sortLevel(b.level) ||
					String(a.activity_area_name || "").localeCompare(String(b.activity_area_name || "")) ||
					String(a.name || "").localeCompare(String(b.name || ""))
				 );

		if (commitToStore) await storeValue("hrFunctionGroupRows", rows, false);
		return rows;
	},

	normalizeTableRow(row) {
		return { ...(row?.allFields || row || {}), ...(row?.updatedFields || {}) };
	},

	getFilteredFunctionGroupRows() {
		const rows = Array.isArray(appsmith.store?.hrFunctionGroupRows) ? appsmith.store.hrFunctionGroupRows : [];
		const activityAreaId = sel_activityArea.selectedOptionValue || appsmith.store?.hrSelectedActivityAreaId || "";
		if (!activityAreaId) return rows;
		return rows.filter((row) => String(row.activity_area_id || "") === String(activityAreaId));
	},

	getNextFunctionGroupLevel(activityAreaId) {
		const rows = Array.isArray(appsmith.store?.hrFunctionGroupRows) ? appsmith.store.hrFunctionGroupRows : [];
		const levels = rows
		.filter((row) => String(row.activity_area_id || "") === String(activityAreaId || ""))
		.map((row) => Number(row.level))
		.filter(Number.isFinite);

		return levels.length ? Math.max(...levels) + 1 : 1;
	},

	async onActivityAreaChanged() {
		await storeValue("hrSelectedActivityAreaId", sel_activityArea.selectedOptionValue || "", true);
		await hrDictionaries.ensureFunctionGroupSelection({ keepSelection: false });
	},

	async ensureFunctionGroupSelection({ keepSelection = true } = {}) {
		const rows = hrDictionaries.getFilteredFunctionGroupRows();
		const currentId = appsmith.store?.hrSelectedFunctionGroup?.id;
		const selected =
					keepSelection && currentId
		? (rows.find((row) => String(row.id) === String(currentId)) || rows[0] || null)
		: (rows[0] || null);

		await storeValue("hrSelectedFunctionGroup", selected, true);
		await utils.getFunctionGroupDutyRows(selected?.id || null);
		resetWidget("rte_curFunctional", true);
		resetWidget("ms_positionsOfFunctional", true);
		return selected;
	},

	async tbl_functionGroups_onRowSelected(rowParam = null) {
		const row = rowParam || tbl_functionGroups.selectedRow;
		const selected = row?.id ? row : null;
		await storeValue("hrSelectedFunctionGroup", selected, true);
		await utils.getFunctionGroupDutyRows(selected?.id || null);
		resetWidget("rte_curFunctional", true);
		resetWidget("ms_positionsOfFunctional", true);
	},

	saveFunctionGroupRow: async (rowParam = null) => {
		const rawRow = rowParam || (tbl_functionGroups.isAddRowInProgress ? tbl_functionGroups.newRow : (tbl_functionGroups.updatedRows?.[0] || tbl_functionGroups.updatedRow || tbl_functionGroups.selectedRow));
		const row = hrDictionaries.normalizeTableRow(rawRow);
		const rowActivityAreaId = row?.activity_area_id?.id ?? row?.activity_area_id;
		const activityAreaId = rowActivityAreaId || sel_activityArea.selectedOptionValue || appsmith.store?.hrSelectedActivityAreaId || null;
		const rawLevel = row?.level;
		const hasLevel = rawLevel !== undefined && rawLevel !== null && String(rawLevel).trim() !== "";
		const level = hasLevel ? Number(rawLevel) : hrDictionaries.getNextFunctionGroupLevel(activityAreaId);

		const body = {
			name: row?.name?.trim?.() || "",
			activity_area_id: activityAreaId,
			level
		};

		if (!body.name) return showAlert("Укажите название функционала", "warning");
		if (!body.activity_area_id) return showAlert("Выберите направление деятельности", "warning");
		if (!Number.isFinite(body.level)) return showAlert("Укажите уровень функционала", "warning");

		let savedId = row.id || null;
		if (tbl_functionGroups.isAddRowInProgress || !savedId) {
			const created = await items.createItems({ collection: "function_groups", body });
			savedId = created?.data?.id || created?.id || null;
		} else {
			await items.updateItems({ collection: "function_groups", body: { keys: [savedId], data: body } });
		}

		const rows = await hrDictionaries.getFunctionGroupRows();
		const filteredRows = hrDictionaries.getFilteredFunctionGroupRows();
		const selected = filteredRows.find((item) => String(item.id) === String(savedId)) || filteredRows[0] || rows[0] || null;
		await storeValue("hrSelectedFunctionGroup", selected, true);
		await utils.getFunctionGroupDutyRows(selected?.id || null);
		resetWidget("rte_curFunctional", true);
		resetWidget("ms_positionsOfFunctional", true);
		showAlert("Функционал сохранен", "success");
	},

	async tbl_position_titles_onRowSelected(rowParam = null) {
		const selected = rowParam?.id ? rowParam : null;
		await storeValue("hrSelectedPositionTitle", selected, true);
		await utils.refreshSelectedPositionTitleFunctionals(selected?.id || null);
	},

	syncPositionTitleFunctionGroups: async (selectedValuesParam = null) => {
		const positionTitleId = appsmith.store?.hrSelectedPositionTitle?.id ?? null;
		if (!positionTitleId) return showAlert("Выберите должность", "warning");

		const selectedValues =
					selectedValuesParam ??
					(typeof mts_positionTitleFunctionals !== "undefined" ? mts_positionTitleFunctionals.selectedOptionValues : []) ??
					[];

		const selectedIds = [];
		const selectedKeys = new Set();

		for (const value of selectedValues || []) {
			if (value === null || value === undefined || value === "") continue;
			if (String(value).startsWith("area:")) continue;

			const normalized = Number.isFinite(Number(value)) ? Number(value) : value;
			const key = String(normalized);
			if (selectedKeys.has(key)) continue;
			selectedKeys.add(key);
			selectedIds.push(normalized);
		}

		const currentRows = await utils.getDutyRows({ commitToStore: false });
		const currentPositionRows = currentRows.filter((row) => String(row.position_title_id || "") === String(positionTitleId));
		const currentByFunctionGroupId = {};
		const duplicateIds = [];

		for (const row of currentPositionRows) {
			const key = String(row.function_group_id || "");
			if (!key) continue;
			if (currentByFunctionGroupId[key]) duplicateIds.push(row.id);
			else currentByFunctionGroupId[key] = row;
		}

		const toCreate = selectedIds.filter((functionGroupId) => !currentByFunctionGroupId[String(functionGroupId)]);
		const toDeleteIds = [...new Set([
			...currentPositionRows.filter((row) => !selectedKeys.has(String(row.function_group_id))).map((row) => row.id),
			...duplicateIds
		].filter(Boolean))];

		if (!toCreate.length && !toDeleteIds.length) {
			await utils.refreshSelectedPositionTitleFunctionals(positionTitleId);
			return;
		}

		if (toCreate.length) {
			await items.createItems({
				collection: "duties",
				body: toCreate.map((functionGroupId) => ({
					function_group_id: functionGroupId,
					position_title_id: positionTitleId
				}))
			});
		}

		if (toDeleteIds.length) {
			await items.deleteItems({ collection: "duties", body: { keys: toDeleteIds } });
		}

		await utils.getDutyRows();
		await utils.refreshSelectedPositionTitleFunctionals(positionTitleId);
		if (String(appsmith.store?.hrSelectedPosition?.position_title_id || "") === String(positionTitleId)) {
			await utils.refreshSelectedPositionFunctionals(positionTitleId);
		}
		if (appsmith.store?.hrSelectedFunctionGroup?.id) {
			await utils.getFunctionGroupDutyRows(appsmith.store.hrSelectedFunctionGroup.id);
		}
		showAlert("Обязанности должности обновлены", "success");
	},

	syncFunctionGroupPositions: async (selectedValuesParam = null, mode = "functionGroup") => {
		const requestedValues = [
			...(
				selectedValuesParam ??
				(mode === "positionTitle" ? mts_areasFunctional.selectedOptionValues : ms_positionsOfFunctional.selectedOptionValues) ??
				[]
			)
		];

		if (hrDictionaries.syncFunctionGroupPositionsRunning) {
			hrDictionaries.syncFunctionGroupPositionsQueued = { selectedValues: requestedValues, mode };
			return;
		}

		hrDictionaries.syncFunctionGroupPositionsRunning = true;

		try {
			let current = { selectedValues: requestedValues, mode };

			while (current) {
				hrDictionaries.syncFunctionGroupPositionsQueued = null;
				await hrDictionaries.syncFunctionGroupPositionsApply(current.selectedValues, current.mode);
				current = hrDictionaries.syncFunctionGroupPositionsQueued;
			}
		} finally {
			hrDictionaries.syncFunctionGroupPositionsRunning = false;
		}
	},

	syncFunctionGroupPositionsApply: async (selectedValuesParam = null, mode = "functionGroup") => {
		const selectedValues =
					selectedValuesParam ??
					(mode === "positionTitle" ? mts_areasFunctional.selectedOptionValues : ms_positionsOfFunctional.selectedOptionValues) ??
					[];

		const selectedIds = [];
		const selectedKeys = new Set();

		for (const value of selectedValues || []) {
			if (value === null || value === undefined || value === "") continue;
			if (String(value).startsWith("area:")) continue;

			const normalized = Number.isFinite(Number(value)) ? Number(value) : value;
			const key = String(normalized);
			if (selectedKeys.has(key)) continue;
			selectedKeys.add(key);
			selectedIds.push(normalized);
		}

		if (mode === "positionTitle") {
			const positionTitleId = appsmith.store?.hrSelectedPosition?.position_title_id || null;
			if (!positionTitleId) return showAlert("Выберите должность", "warning");

			const currentRows = await utils.getDutyRows({ commitToStore: false });
			const currentPositionRows = currentRows.filter((row) => String(row.position_title_id || "") === String(positionTitleId));
			const currentByFunctionGroupId = {};
			const duplicateIds = [];

			for (const row of currentPositionRows) {
				const key = String(row.function_group_id || "");
				if (!key) continue;
				if (currentByFunctionGroupId[key]) duplicateIds.push(row.id);
				else currentByFunctionGroupId[key] = row;
			}

			const toCreate = selectedIds.filter((functionGroupId) => !currentByFunctionGroupId[String(functionGroupId)]);
			const toDeleteIds = [...new Set([
				...currentPositionRows.filter((row) => !selectedKeys.has(String(row.function_group_id))).map((row) => row.id),
				...duplicateIds
			].filter(Boolean))];

			if (!toCreate.length && !toDeleteIds.length) {
				await utils.refreshSelectedPositionFunctionals(positionTitleId);
				return;
			}

			if (toCreate.length) {
				await items.createItems({
					collection: "duties",
					body: toCreate.map((functionGroupId) => ({
						function_group_id: functionGroupId,
						position_title_id: positionTitleId
					}))
				});
			}

			if (toDeleteIds.length) {
				await items.deleteItems({ collection: "duties", body: { keys: toDeleteIds } });
			}

			await utils.getDutyRows();
			await utils.refreshSelectedPositionFunctionals(positionTitleId);
			if (appsmith.store?.hrSelectedFunctionGroup?.id) {
				await utils.getFunctionGroupDutyRows(appsmith.store.hrSelectedFunctionGroup.id);
			}
			showAlert("Функционалы должности обновлены", "success");
			return;
		}

		const functionGroupId = appsmith.store?.hrSelectedFunctionGroup?.id || null;
		if (!functionGroupId) return showAlert("Выберите функционал", "warning");

		const currentRows = await utils.getFunctionGroupDutyRows(functionGroupId, { commitToStore: false });
		const currentByPositionId = {};
		const duplicateIds = [];

		for (const row of currentRows) {
			const key = String(row.position_title_id || "");
			if (!key) continue;
			if (currentByPositionId[key]) duplicateIds.push(row.id);
			else currentByPositionId[key] = row;
		}

		const toCreate = selectedIds.filter((positionTitleId) => !currentByPositionId[String(positionTitleId)]);
		const toDeleteIds = [...new Set([
			...currentRows.filter((row) => !selectedKeys.has(String(row.position_title_id))).map((row) => row.id),
			...duplicateIds
		].filter(Boolean))];

		if (!toCreate.length && !toDeleteIds.length) {
			await utils.getFunctionGroupDutyRows(functionGroupId);
			return;
		}

		if (toCreate.length) {
			await items.createItems({
				collection: "duties",
				body: toCreate.map((positionTitleId) => ({
					function_group_id: functionGroupId,
					position_title_id: positionTitleId
				}))
			});
		}

		if (toDeleteIds.length) {
			await items.deleteItems({ collection: "duties", body: { keys: toDeleteIds } });
		}

		await utils.getDutyRows();
		await utils.getFunctionGroupDutyRows(functionGroupId);
		await utils.refreshSelectedPositionFunctionals();
		showAlert("Привязка должностей обновлена", "success");
	},

	savePositionTitleRow: async (rowParam = null) => {
		const rawRow = rowParam || (tbl_position_titles.isAddRowInProgress ? tbl_position_titles.newRow : (tbl_position_titles.updatedRows?.[0] || tbl_position_titles.updatedRow || tbl_position_titles.selectedRow));
		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const body = { title: row?.title?.trim?.() || "" };

		if (!body.title) return showAlert("Укажите название должности", "warning");

		const isNew = tbl_position_titles.isAddRowInProgress || !row.id;
		let savedId = row.id || null;

		if (isNew) {
			const created = await items.createItems({ collection: "position_titles", body });
			savedId = created?.data?.id || created?.data?.[0]?.id || created?.id || null;
		} else {
			await items.updateItems({ collection: "position_titles", body: { keys: [savedId], data: body } });
		}

		const rows = await hrDictionaries.getPositionTitleRows();
		const currentSelectedId = appsmith.store?.hrSelectedPositionTitle?.id || null;

		if (savedId && (isNew || String(currentSelectedId || "") === String(savedId))) {
			const selected = rows.find((item) => String(item.id) === String(savedId)) || null;
			await storeValue("hrSelectedPositionTitle", selected, true);
			await utils.refreshSelectedPositionTitleFunctionals(savedId);
		}

		showAlert("Название должности сохранено", "success");
	},

	saveCityRow: async (rowParam = null) => {
		const rawRow =
					rowParam ||
					(tbl_cities.isAddRowInProgress
					 ? tbl_cities.newRow
					 : (tbl_cities.updatedRows?.[0] || tbl_cities.updatedRow || tbl_cities.selectedRow));

		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const name = row?.name?.trim?.() || "";
		const body = { name };

		if (!body.name) return showAlert("Укажите город", "warning");

		if (tbl_cities.isAddRowInProgress) {
			await items.createItems({ collection: "cities", body });
		} else {
			await items.updateItems({ collection: "cities", body: { keys: [row.id], data: body } });
		}

		await Promise.all([
			hrDictionaries.getCityRows(),
			hrDictionaries.getBranches()
		]);
		showAlert("Город сохранен", "success");
	},

	saveBranchRow: async (rowParam = null) => {
		const rawRow = rowParam || (tbl_branches.isAddRowInProgress ? tbl_branches.newRow : (tbl_branches.updatedRows?.[0] || tbl_branches.updatedRow || tbl_branches.selectedRow));
		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const body = {
			name: row?.name?.trim?.() || "",
			city_id: row?.city_id || null
		};
		if (!body.name) return showAlert("Укажите подразделение", "warning");

		if (tbl_branches.isAddRowInProgress) await items.createItems({ collection: "branches", body });
		else await items.updateItems({ collection: "branches", body: { keys: [row.id], data: body } });

		await hrDictionaries.getBranches();
		showAlert("Подразделение сохранено", "success");
	}
}