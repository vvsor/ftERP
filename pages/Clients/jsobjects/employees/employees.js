export default {
	chooseEmployeeControls() {
		function toggleWidgetState(sourceWidget, targetWidget) {
			targetWidget.setDisabled(!(sourceWidget.selectedOptionValue && !sourceWidget.isDisabled));
		}

		try {
			toggleWidgetState(sel_chooseBranch, sel_chooseSphere);
			toggleWidgetState(sel_chooseSphere, sel_chooseFunctional);
			toggleWidgetState(sel_chooseFunctional, sel_chooseEmployee);
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
			collection: "spheres",
			limit: -1
		});
		return (response.data || []).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	},

	getFunctionals: async () => {
		const response = await items.getItems({
			fields: "id,name",
			collection: "functionals",
			limit: -1
		});
		return (response.data || []).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
	}
};