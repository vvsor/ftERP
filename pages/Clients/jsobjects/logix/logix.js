export default {
	/// ================================= test block =================================
	test: async () => {
		try {
			const fields = [
				"id", "name", "logix_client_id",
				"supervisor_id", "supervisor_id.last_name", "supervisor_id.first_name",
			].join(",");

			const filter = { logix_client_id: { _eq: '22000000' } };

			const params = {
				fields: fields,
				collection: "clients",
				filter: filter
			};
			const response = await items.getItems(params);
			const linkedClients = response.data || [];
			const LinkedClientsQnt = linkedClients.length;
			showAlert(`There is ${LinkedClientsQnt} linked client(s).`, 'success');
			return LinkedClientsQnt;
		} catch (error) {
			showAlert('Autosave for client name failed.', 'warning');
		}
	},
	/// ============================= end of test block ============================

	getLogixClientsByINN_KPP: async (inn, kpp) => {
		let params = {};
		if (inn && kpp) {
			params = { inn, kpp };
		} else if (inn) {
			params = { inn };
		}
		try {
			const response = await qGetClient_by_inn_kpp.run(params);
			console.log("response: ", response);
			return response;
			// // console.log(`Retrieved ${response.data?.length || 0} comments for task ${taskId}`);
			// // const Sorted = response.data;
			// // Sorted.sort((a, b) => b.id - a.id);
			// const clients = response;
			// return clients.client_id;
		} catch (error) {
			console.error(`Error fetching client by INN-KPP`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	connectWithLogixClient: async () => {
		const inn = inp_clientINN.text;
		const kpp = inp_clientKPP.text;
		// INN: 10 or 12 digits; KPP: 9 digits or empty
		if (
			(/^\d{10}$/.test(inn) || /^\d{12}$/.test(inn)) &&
			(/^\d{9}$/.test(kpp) || !kpp)
		) {
			try {
				const response = await logix.getLogixClientsByINN_KPP(inn, kpp);
				const logix_client_id = response.client_id;
				const logix_client_name = response.name;
				showAlert(`Головной клиент в Logix: ${logix_client_name}, ID: ${logix_client_id}`, 'success');
				// check if client already linked
				try {
					const fields = [
						"id", "name", "logix_client_id",
						"supervisor_id", "supervisor_id.last_name", "supervisor_id.first_name",
					].join(",");

					const filter = { logix_client_id: { _eq: logix_client_id } };

					const params = {
						fields: fields,
						collection: "clients",
						filter: filter
					};
					const response = await items.getItems(params);
					const linkedClients = response.data || [];
					console.log(linkedClients);
					if (linkedClients.length > 0) {
						showModal(mdl_linkedClientAlert.name);
						txt_linkedClientAlertText.setText(`Клиент <b>${linkedClients[0].name}</b>: (супервайзер ${linkedClients[0].supervisor_id.last_name} ${linkedClients[0].supervisor_id.first_name}) уже привязан к клиенту Logix <b>${logix_client_name}</b>  с ID ${logix_client_id}:`);
						return;
					}
				} catch (error) {
					showAlert('Checking clients with linked logix_client_id failed.', 'error');
				}

				showAlert('Сохраняем Logix ID...', 'info');

				const body = {
					keys: [clients.selectedClient.id],
					data: {	logix_client_id: logix_client_id	}
				};
				const params = { collection: "clients",	body: body };
				await items.updateItems(params);

				await clients.updateClientsList();
				showAlert('Клиент привязан!', 'success');
				await utils.addAuditAction('client_edit', undefined, undefined, clients.selectedClient.id);
			} catch (error) {
				console.error("Error in client updating:", error);
				throw error; // Re-throw to allow calling code to handle the error
			}
		}
	}
}