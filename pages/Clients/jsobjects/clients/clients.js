export default {
	// Clients' js object
	selectedClient: undefined,
	savedClientId: undefined,			// for keeping last selected client ID for restoring last

	setSelectedClient: async (client) => {		
		clients.selectedClient = client;
		await storeValue("selectedClient", client || null, true);
	},

	saveSelectedClientId: async () => {
		clients.savedClientId = clients.selectedClient?.id;
	},

	restoreSavedClientSelection: async () => {
		if (!clients.savedClientId) return;
		const rows = appsmith.store?.clientRows || tbl_clients.tableData || [];
		const index = rows.findIndex((row) => String(row.id) === String(clients.savedClientId));
		if (index < 0) {
			clients.savedClientId = undefined;
			return;
		}
		await tbl_clients.setSelectedRowIndex(index);
		await clients.setSelectedClient(rows[index]);
		clients.savedClientId = undefined;
	},

	initClients: async () => {
		const user = appsmith.store?.user;
		const isEditMode = appsmith.mode === "EDIT";

		if (!user?.token) {
			if (isEditMode) {
				showAlert("EDIT: нет токена пользователя, остаёмся на странице Clients без загрузки данных.", "warning");
			} else {
				showAlert("Требуется авторизация. Перенаправление на страницу входа.", "info");
				navigateTo("Auth");
			}
			return;
		}

		const hasClientsAccess = await nav.hasPage("clients");

		if (!hasClientsAccess) {
			showAlert("Нет доступа к странице Clients.", "warning");

			if (!isEditMode) {
				navigateTo("Auth");
				return;
			}
		}

		try {
			await items.ensureFreshToken();
			autosave.initAutosave();

			await Promise.all([
				channels.getChannelsTypes(),
				utils.GetUsersOfficeTerms(),
				employees.getBranches(),
				employees.getSpheres(),
				employees.getFunctionals(),
				employees.getDuties()
			]);

			await clients.updateClientsList({ keepSelection: false });
		} catch (error) {
			if (error?.authHandled) return;
			console.error("Error loading clients:", error);
			showAlert("Ошибка загрузки страницы клиентов", "error");
		}
	},

	updateClientsList: async ({ keepSelection = true } = {}) => {
		try {
			const previousId = keepSelection ? clients.selectedClient?.id : null;
			const clientsData = await clients.getClients();

			await storeValue("clientRows", clientsData, false);

			if (!clientsData.length) {
				await clients.setSelectedClient();
				await storeValue("clientContactRows", [], false);
				await storeValue("contactChannelRows", [], false);
				return [];
			}

			const selected =
						(previousId ? clientsData.find((row) => String(row.id) === String(previousId)) : null) ||
						clientsData[0];

			await clients.setSelectedClient(selected);

			const index = clientsData.findIndex((row) => String(row.id) === String(selected.id));
			if (index >= 0) await tbl_clients.setSelectedRowIndex(index);

			await clients.tbs_client_onTabSelected();
			return clientsData;
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error loading clients:", error);
			showAlert("Не удалось загрузить клиентов. Пожалуйста, обновите список или перезагрузите страницу.", "error");
			return [];
		}
	},

	tbl_clients_onRowSelected: async () => {
		const row = tbl_clients.selectedRow;
		if (!row?.id) return;

		await contacts.setSelectedContact();
		await channels.setSelectedChannel();
		await storeValue("clientContactRows", [], false);
		await storeValue("contactChannelRows", [], false);

		await clients.setSelectedClient(row);
		await clients.tbs_client_onTabSelected();
		await utils.addAuditAction({ action: "client_view", clientId: row.id });
	},

	tbs_client_onTabSelected: async () => {
		const clientId = clients.selectedClient?.id;
		if (!clientId) return;

		switch (tbl_client.selectedTab) {
			case "Логи":
				await utils.getClientLog(clientId);
				break;
			case "Контактные лица":
				await contacts.updateContactsList(clientId);
				break;
			default:
				break;
		}
	},

	openAddClientModal: async () => {
		await clients.saveSelectedClientId();
		await clients.setSelectedClient();
		resetWidget("frm_addEditClient", true);
		showModal(mdl_addEditClient.name);
	},

	closeClientModal: () => {
		closeModal(mdl_addEditClient.name);
	},

	getClients: async () => {
		const fields = [
			"id", "name", "inn", "kpp", "phones", "description", "date_created", "logix_client_id",
			"user_created_id.id",
			"user_created_id.first_name",
			"user_created_id.last_name",
			"user_created_id.middle_name",
			"supervisor_id.id",
			"supervisor_id.first_name",
			"supervisor_id.last_name",
			"supervisor_id.middle_name"
		].join(",");

		const supervisorId =
					sel_chooseEmployee.selectedOptionValue && !sel_chooseEmployee.isDisabled
		? sel_chooseEmployee.selectedOptionValue
		: null;

		const params = {
			fields,
			collection: "clients",
			filter: supervisorId ? { supervisor_id: { _eq: supervisorId } } : {},
			limit: -1
		};

		try {
			const response = await items.getItems(params);
			const sourceData = Array.isArray(response.data) ? response.data : [];

			return sourceData.map((item) => ({
				id: item.id,
				name: item.name || "",
				inn: item.inn || "",
				kpp: item.kpp || "",
				phones: item.phones || "",
				description: item.description || "",
				date_created: item.date_created || "",
				user_created_id: item.user_created_id?.id ?? item.user_created_id ?? null,
				user_created_name: utils.formatUserName(item.user_created_id),
				supervisor_id: item.supervisor_id?.id ?? item.supervisor_id ?? null,
				supervisor_name: utils.formatUserName(item.supervisor_id),
				logix_client_id: item.logix_client_id || ""
			})).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
		} catch (error) {
			console.error("Error fetching clients", error);
			throw error;
		}
	},

	addClient: async () => {
		const name = inp_clientAddName.text?.trim();
		const supervisorId = sel_clientAddSuperviser.selectedOptionValue || appsmith.store?.user?.id || null;

		if (!name) return showAlert("Укажите название клиента", "warning");
		if (!supervisorId) return showAlert("Выберите супервайзера", "warning");

		try {
			showAlert("Создаем клиента...", "info");

			const newClient = await items.createItems({
				collection: "clients",
				body: {
					name,
					description: inp_clientAddDescription.text || "",
					supervisor_id: supervisorId,
					user_created_id: appsmith.store.user.id
				}
			});

			const clientId = newClient?.data?.id;
			const rows = await clients.updateClientsList({ keepSelection: false });
			const selected = rows.find((row) => String(row.id) === String(clientId)) || rows[0] || null;
			const index = selected ? rows.findIndex((row) => String(row.id) === String(selected.id)) : -1;

			if (index >= 0) await tbl_clients.setSelectedRowIndex(index);
			await clients.setSelectedClient(selected);
			if (selected?.id) await clients.tbs_client_onTabSelected();

			await utils.addAuditAction({ action: "client_add", clientId: selected?.id || clientId });
			showAlert("Клиент создан", "success");
			closeModal(mdl_addEditClient.name);
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error in client creation:", error);
			showAlert("Ошибка при создании клиента", "error");
			throw error;
		}
	}
}