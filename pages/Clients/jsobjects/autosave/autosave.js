export default {
	// Debounce utility function
	debounce(func, delay = 2000) {
		let timeoutId;
		return (...args) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => func(...args), delay);
		};
	},

	// Save function for description
	saveDescription: async function() {
		try {
			const body = {
				keys: [clients.selectedClient.id],
				data: {	description: inp_clientDescription.text	}
			};
			const params = { collection: "clients",	body: body };
			await items.updateItems(params);

			await clients.updateClientsList();

			showAlert('Description autosaved!', 'success');
		} catch (error) {
			console.error('Autosave (description) failed:', error);
			showAlert('Autosave for description failed.', 'warning');
		}
	},

	// Save function for name
	saveName: async function() {
		try {
			const body = {
				keys: [clients.selectedClient.id],
				data: {	name: inp_clientName.text	}
			};

			const params = { collection: "clients",	body: body };

			await items.updateItems(params);
			await clients.updateClientsList();

			showAlert('Client name autosaved!', 'success');
		} catch (error) {
			showAlert('Autosave for client name failed.', 'warning');
		}
	},

	// Debounced save functions (5 seconds delay)
	debouncedSaveDescription: null,
	debouncedSaveName: null,

	// Initialization function to set up debounced functions
	initAutosave: function() {
		// Only initialize once
		if (!this.debouncedSaveDescription) {
			this.debouncedSaveDescription = this.debounce(this.saveDescription, 2000);
		}
		if (!this.debouncedSaveName) {
			this.debouncedSaveName = this.debounce(this.saveName, 2000);
		}
	},
	
	updateSupervisor: async () => {
		const body = {
			keys: [clients.selectedClient.id],
			data: {
				supervisor_id: sel_clientSuperviser.selectedOptionValue
			}
		};

		const params = {
			collection: "clients",
			body: body
		};

		await items.updateItems(params);
		await clients.updateClientsList();
	}
}