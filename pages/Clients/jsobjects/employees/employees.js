export default {
	chooseEmployeeControls: async (changedControl = "") => {
		try {
			if (changedControl === "branch") {
				await resetWidget("sel_chooseSphere", true);
				await resetWidget("sel_chooseFunctional", true);
				await resetWidget("sel_chooseEmployee", true);
			} else if (changedControl === "sphere") {
				await resetWidget("sel_chooseFunctional", true);
				await resetWidget("sel_chooseEmployee", true);
			} else if (changedControl === "functional") {
				await resetWidget("sel_chooseEmployee", true);
			}

			const hasBranch = Boolean(sel_chooseBranch.selectedOptionValue);
			const hasSphere = hasBranch && Boolean(sel_chooseSphere.selectedOptionValue);
			const hasFunctional = hasSphere && Boolean(sel_chooseFunctional.selectedOptionValue);

			await sel_chooseSphere.setDisabled(!hasBranch);
			await sel_chooseFunctional.setDisabled(!hasSphere);
			await sel_chooseEmployee.setDisabled(!hasFunctional);

			await clients.updateClientsList({ keepSelection: false });
		} catch (error) {
			console.error("Error in chooseEmployeeControls: ", error);
		}
	},

	getBranches: async () => {
		const response = await items.getItems({
			fields: "id,name",
			collection: "branches",
			limit: -1
		});
		return (response.data || []).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	},

	getSpheres: async () => {
		const response = await items.getItems({
			fields: "id,name",
			collection: "activity_areas",
			limit: -1
		});
		return (response.data || []).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	},

	getFunctionals: async () => {
		const response = await items.getItems({
			fields: "id,name,activity_area_id.id",
			collection: "function_groups",
			limit: -1
		});

		return (response.data || [])
			.map((row) => ({
			id: row.id,
			name: row.name || "",
			activity_area_id: row.activity_area_id?.id ?? row.activity_area_id ?? null
		}))
			.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	},

	getDuties: async () => {
		const response = await items.getItems({
			fields: [
				"id",
				"function_group_id.id",
				"function_group_id.activity_area_id.id",
				"position_title_id.id"
			].join(","),
			collection: "duties",
			limit: -1
		});

		return (response.data || []).map((row) => ({
			id: row.id,
			function_group_id: row.function_group_id?.id ?? row.function_group_id ?? null,
			activity_area_id: row.function_group_id?.activity_area_id?.id ?? row.function_group_id?.activity_area_id ?? null,
			position_title_id: row.position_title_id?.id ?? row.position_title_id ?? null
		}));
	},

	getFilteredFunctionals: () => {
		const sphereId = sel_chooseSphere.selectedOptionValue;
		const rows = employees.getFunctionals.data || [];

		if (!sphereId) return rows;
		return rows.filter((row) => String(row.activity_area_id) === String(sphereId));
	},

	getFilteredOfficeTerms: () => {
		const branchId = sel_chooseBranch.selectedOptionValue;
		const sphereId = sel_chooseSphere.selectedOptionValue;
		const functionalId = sel_chooseFunctional.selectedOptionValue;
		const officeTerms = utils.GetUsersOfficeTerms.data || [];
		const duties = employees.getDuties.data || [];

		const matchingPositionTitleIds = new Set(
			duties
			.filter((row) => !sphereId || String(row.activity_area_id) === String(sphereId))
			.filter((row) => !functionalId || String(row.function_group_id) === String(functionalId))
			.map((row) => String(row.position_title_id))
		);

		return officeTerms.filter((row) => {
			const branchIds = row.branch_ids?.length ? row.branch_ids : [row.branch_id].filter(Boolean);
			const positionTitleIds = row.position_title_ids?.length ? row.position_title_ids : [row.position_title_id].filter(Boolean);
			const branchMatches = !branchId || branchIds.some((id) => String(id) === String(branchId));
			const dutyMatches = !sphereId && !functionalId
			? true
			: positionTitleIds.some((id) => matchingPositionTitleIds.has(String(id)));

			return branchMatches && dutyMatches;
		});
	}
};