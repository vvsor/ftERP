export default {
	savePositionTitleRow: async (rowParam = null) => {
		const rawRow = rowParam || (tbl_position_titles.isAddRowInProgress ? tbl_position_titles.newRow : (tbl_position_titles.updatedRows?.[0] || tbl_position_titles.updatedRow || tbl_position_titles.selectedRow));
		const row = { ...(rawRow?.allFields || rawRow || {}), ...(rawRow?.updatedFields || {}) };
		const body = { title: row?.title?.trim?.() || "" };
		if (!body.title) return showAlert("Укажите название должности", "warning");

		if (tbl_position_titles.isAddRowInProgress) await items.createItems({ collection: "position_titles", body });
		else await items.updateItems({ collection: "position_titles", body: { keys: [row.id], data: body } });

		await utils.getPositionTitleRows();
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
			utils.getCityRows(),
			utils.getBranches()
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

		await utils.getBranches();
		showAlert("Подразделение сохранено", "success");
	}
}