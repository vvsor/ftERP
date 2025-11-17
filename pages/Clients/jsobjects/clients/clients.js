export default {
	// Clients' js object
	selectedClient: undefined,
	savedClientId: undefined,			// for keeping last selected client ID for restoring last


	/// ================================= test block =================================
	Test: async () => {
		closeModal(mdl_addEditClient.name);
	},

	/// ============================= end of test block ============================

	setSelectedClient: async (client) => {		
		this.selectedClient = client;
	},

	saveSelectedClientId: async () => {
		if (this.savedClientId) {
			showAlert('There is saved client ID', 'error');
		}
		this.savedClientId = this.selectedClient.id;
	},

	restoreSavedClientSelection: async () => {
		const index = tbl_clients.tableData.findIndex(row => row.id === this.savedClientId);
		const curRow = await tbl_clients.setSelectedRowIndex(index);
		this.selectedClient = tbl_clients.tableData[curRow];
		this.savedClientId = undefined;
	},

	initClientsPage: async () => {
		if (appsmith.store?.user?.token == undefined){
			if (appsmith.user.email !== 'vvs@osagent.ru') {
				// this check needs for developer, otherwise we can not get into this page
				showAlert('Обычный пользователь отправляется на страницу авторизации, а не должен, т.к.:', 'success');
				navigateTo('Auth');
			} else {
				showAlert('Обычный пользователь отправляется на страницу авторизации', 'success');
			}
			return;
		}

		channels.getChannelsTypes();
		autosave.initAutosave();
		clients.updateClientsList();

		return;
	},

	updateClientsList: async () => {
		if (clients.selectedClient) {
			// keeping last selectedItem's ID for restoring last state
			await clients.saveSelectedClientId();
		}

		try {
			const clientsData = await clients.getClients();
			await tbl_clients.setData(clientsData);
			if (clientsData.length > 0 ) {
				if (clients.savedClientId) {	//  restore saved client before updating if it was saved
					await clients.restoreSavedClientSelection();
				} else {	//	set first client as active
					await clients.setSelectedClient(clientsData[0]);	
				}
				await clients.tbs_client_onTabSelected();
			}
		} catch (error) {
			console.error("Error loading clients:", error);
			showAlert("Не удалось загрузить клиентов. Пожалуйста, обновите список или перезагрузите страницу.", "error");
		}
	},

	tbl_clients_onRowSelected: async () => {
		contacts.setSelectedContact();	// clear selected contact before changing client
		clients.setSelectedClient(clients.getClients.data[tbl_clients.selectedRowIndex]);
		clients.tbs_client_onTabSelected();
		utils.addAuditAction({action: 'client_view', clientId: tbl_clients.selectedRow.id});
	},

	tbs_client_onTabSelected: async () => {
		// if task is selected and...
		if (clients.selectedClient){
			const clientId = clients.selectedClient.id;
			// update selected tab
			switch (tbl_client.selectedTab){
				case "Логи":
					utils.getClientLog(clientId);
					break;
				case "Контактные лица":
					await contacts.updateContactsList(clientId);
					break;
			}
			utils.addAuditAction("client_view",tbl_clients.selectedRow.id);
		} else {
			return
		}
	},

	openAddClientModal: ()=> {
		// save selected client for restoring it if nothing will be added
		clients.saveSelectedClientId();
		// clear currently selected client
		clients.setSelectedClient();
		// utils.GetUsersOfficeTerms();
		showModal(mdl_addEditClient.name);
	},

	closeClientModal: () => {
		closeModal(mdl_addEditClient.name);
	},

	getClients: async () => {
		try {
			// Define the fields to include in the response
			const fields = [
				"id", "name", "inn", "kpp", "phones", "description", "logix_client_id",
				"user_created_id.id",
				"user_created_id.first_name",
				"user_created_id.last_name",
				"supervisor_id.id",
				"supervisor_id.first_name",
				"supervisor_id.last_name",
			].join(",");

			const params = {
				fields: fields,
				collection: "clients"
			};
			const response = await items.getItems(params);
			const sourceData = response.data;
			const clients = sourceData.map(item => ({
				id: item.id,
				name: item.name,
				description: item.description,
				date_created: item.date_created,
				user_created_id: item.user_created_id.id,
				user_created_name: `${item.user_created_id.last_name} ${item.user_created_id.first_name[0]}.`,
				supervisor_id: item.supervisor_id.id,
				supervisor_name: `${item.supervisor_id.last_name} ${item.supervisor_id.first_name[0]}.`,
				logix_client_id: item.logix_client_id
			}));

			// Sort by name (ascending)
			clients.sort((a, b) => a.name.localeCompare(b.name));

			return clients;
		} catch (error) {
			console.error(`Error fetching clients`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	addClient: async () => {
		try {
			showAlert('Создаем клиента...', 'info');

			const body = {
				name: inp_clientAddName.text,
				description: inp_clientAddDescription.text,
				supervisor_id: sel_clientAddSuperviser.selectedOptionValue,
				date_updated: new Date().toISOString(),
				user_created_id: appsmith.store.user.id
			};

			const params = {
				collection: "clients",
				body: body
			};

			// 1. Create client
			const newClient = await items.createItems(params);
			const clientId = newClient.data.id;


			tbl_clients.setSelectedRowIndex(tbl_clients.tableData.length - 1);

			// 4. Refresh tasks (triggers table reactivity)
			// below we use 'withNewTasks', becase tasks.getTasks() do not contain
			// our new task... because of async ?!?
			const withNewClient = await this.getClients();
			await tbl_clients.setData(withNewClient);

			// 5. Select the new row after data refresh
			const index = tbl_clients.tableData.findIndex(row => row.id === clientId);
			const curRow = await tbl_clients.setSelectedRowIndex(index);
			clients.setSelectedClient(tbl_clients.tableData[curRow]);

			// 6. Finalize
			await utils.addAuditAction('client_add', undefined, undefined, clients.selectedClient.id);
			showAlert('Клиент создан!', 'success');
			closeModal(mdl_addEditClient.name);
		} catch (error) {
			// General catch for the entire operation
			console.error("Error in task processing:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}