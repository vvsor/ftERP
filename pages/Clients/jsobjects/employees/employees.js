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
	}
};