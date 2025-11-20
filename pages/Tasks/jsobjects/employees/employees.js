export default {
	chooseEmployeeControls() {
		// Helper function to enable/disable a widget based on another widget's state
		function toggleWidgetState(sourceWidget, targetWidget) {
			if (sourceWidget.selectedOptionValue && !sourceWidget.isDisabled) {
				targetWidget.setDisabled(false) // Enable target widget
			} else {
				targetWidget.setDisabled(true)  // Disable target widget
			}
		}

		try {
			// Check dependencies and toggle states
			toggleWidgetState(sel_chooseBranch, sel_chooseSphere);      // Branch -> Sphere
			toggleWidgetState(sel_chooseSphere, sel_chooseFunctional); // Sphere -> Functional
			toggleWidgetState(sel_chooseFunctional, sel_chooseEmployee); // Functional -> Employee
		} catch (error) {
			console.error("Error in chooseEmployeeControls: ", error);
		}
	},
	getBranches: async () => {
		try {
			// Fields to fetch
			const fields = [
				"id", "name"
			].join(",");

			const params = {
				fields: fields,
				collection: "branches",
			};
			const response = await items.getItems(params);
			const allBranches = response.data || [];
			// Sort by name (ascending)
			allBranches.sort((a, b) => a.name.localeCompare(b.name));
			return allBranches;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	getSpheres: async () => {
		try {
			// Fields to fetch
			const fields = [
				"id", "name"
			].join(",");

			const params = {
				fields: fields,
				collection: "spheres",
			};
			const response = await items.getItems(params);
			const allSpheres = response.data || [];
			// Sort by name (ascending)
			if (allSpheres.length >1 ) {
				allSpheres.sort((a, b) => a.name.localeCompare(b.name));
			}
			return allSpheres;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	getFunctionals: async () => {
		try {
			// Fields to fetch
			const fields = [
				"id", "name"
			].join(",");

			const params = {
				fields: fields,
				collection: "functionals",
			};
			const response = await items.getItems(params);
			const allSpheres = response.data || [];
			// Sort by name (ascending)
			if (allSpheres.length >1 ) {
				allSpheres.sort((a, b) => a.name.localeCompare(b.name));
			}
			return allSpheres;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},


};