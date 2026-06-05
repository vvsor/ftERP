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
		const clientId = clients.selectedClient?.id;
		if (!clientId) return;

		try {
			await items.updateItems({
				collection: "clients",
				body: {
					keys: [clientId],
					data: { description: inp_clientDescription.text || "" }
				}
			});

			await clients.updateClientsList({ keepSelection: true });

			showAlert("Описание сохранено", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Autosave description failed:", error);
			showAlert("Ошибка автосохранения описания", "warning");
		}
	},

	// Save function for name
	saveName: async function() {
		const clientId = clients.selectedClient?.id;
		const name = inp_clientName.text?.trim();
		if (!clientId) return;
		if (!name) return showAlert("Укажите название клиента", "warning");

		try {
			await items.updateItems({
				collection: "clients",
				body: {
					keys: [clientId],
					data: { name }
				}
			});
			await clients.updateClientsList({ keepSelection: true });

			showAlert("Название клиента сохранено", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Autosave name failed:", error);
			showAlert("Ошибка автосохранения названия клиента", "warning");
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
		const clientId = clients.selectedClient?.id;
		const supervisorId = sel_clientSuperviser.selectedOptionValue;

		if (!clientId || !supervisorId) return;
		if (String(supervisorId) === String(clients.selectedClient?.supervisor_id || "")) return;

		try {
			await items.updateItems({
				collection: "clients",
				body: {
					keys: [clientId],
					data: { supervisor_id: supervisorId }
				}
			});

			await clients.updateClientsList({ keepSelection: true });
			showAlert("Супервайзер сохранен", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Autosave supervisor failed:", error);
			showAlert("Ошибка сохранения супервайзера", "warning");
		}
	}
}