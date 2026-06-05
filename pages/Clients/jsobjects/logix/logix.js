export default {
	/// ================================= test block =================================
	// test: async () => {
	// try {
	// const fields = [
	// "id", "name", "logix_client_id",
	// "supervisor_id", "supervisor_id.last_name", "supervisor_id.first_name",
	// ].join(",");
	// 
	// const filter = { logix_client_id: { _eq: '22000000' } };
	// 
	// const params = {
	// fields: fields,
	// collection: "clients",
	// filter: filter
	// };
	// const response = await items.getItems(params);
	// const linkedClients = response.data || [];
	// const LinkedClientsQnt = linkedClients.length;
	// showAlert(`There is ${LinkedClientsQnt} linked client(s).`, 'success');
	// return LinkedClientsQnt;
	// } catch (error) {
	// showAlert('Autosave for client name failed.', 'warning');
	// }
	// },
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
		const clientId = clients.selectedClient?.id;
		const inn = inp_clientINN.text?.trim();
		const kpp = inp_clientKPP.text?.trim();

		if (!clientId) return showAlert("Сначала выберите клиента", "warning");

		// INN: 10 or 12 digits; KPP: 9 digits or empty
		if (!((/^\d{10}$/.test(inn) || /^\d{12}$/.test(inn)) && (/^\d{9}$/.test(kpp) || !kpp))) {
			return showAlert("Проверьте ИНН/КПП", "warning");
		}

		try {
			const response = await logix.getLogixClientsByINN_KPP(inn, kpp);
			const logixClientId = response?.client_id;
			const logixClientName = response?.name || "";

			if (!logixClientId) return showAlert("Клиент Logix не найден", "warning");

			showAlert(`Головной клиент в Logix: ${logixClientName}, ID: ${logixClientId}`, "success");

			const linkedResponse = await items.getItems({
				fields: [
					"id",
					"name",
					"logix_client_id",
					"supervisor_id.id",
					"supervisor_id.last_name",
					"supervisor_id.first_name",
					"supervisor_id.middle_name"
				].join(","),
				collection: "clients",
				filter: { logix_client_id: { _eq: logixClientId } },
				limit: -1
			});

			const linkedClients = (linkedResponse.data || [])
			.filter((client) => String(client.id) !== String(clientId));

			if (linkedClients.length > 0) {
				const linkedClient = linkedClients[0];
				const supervisorName = utils.formatUserName(linkedClient.supervisor_id);

				showModal(mdl_linkedClientAlert.name);
				txt_linkedClientAlertText.setText(`Клиент <b>${linkedClient.name}</b>: (супервайзер ${supervisorName}) уже привязан к клиенту Logix <b>${logixClientName}</b> с ID ${logixClientId}:`);
				return;
			}

			showAlert("Сохраняем Logix ID...", "info");

			await items.updateItems({
				collection: "clients",
				body: {
					keys: [clientId],
					data: { logix_client_id: logixClientId }
				}
			});

			await clients.updateClientsList({ keepSelection: true });
			showAlert("Клиент привязан", "success");
			await utils.addAuditAction({ action: "client_edit", clientId });
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error in client updating:", error);
			showAlert("Ошибка привязки клиента к Logix", "error");
			throw error;
		}
	}
}