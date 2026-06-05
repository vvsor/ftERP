export default {
	// Contacts js object
	selectedContact: undefined,
	savedContactId: undefined,

	normalizeTableRow(row) {
		return { ...(row?.allFields || row || {}), ...(row?.updatedFields || {}) };
	},

	setSelectedContact: async (contact) => {
		contacts.selectedContact = contact;
		await storeValue("selectedContact", contact || null, true);
	},

	saveSelectedContact: async () => {
		contacts.savedContactId = contacts.selectedContact?.id;
	},

	restoreSavedContactSelection: async () => {
		if (!contacts.savedContactId) return;
		const rows = appsmith.store?.clientContactRows || tbl_contacts.tableData || [];
		const index = rows.findIndex((row) => String(row.id) === String(contacts.savedContactId));

		if (index < 0) {
			contacts.savedContactId = undefined;
			return;
		}

		await tbl_contacts.setSelectedRowIndex(index);
		await contacts.setSelectedContact(rows[index]);
		contacts.savedContactId = undefined;
	},

	updateContactsList: async (clientId = clients.selectedClient?.id) => {
		if (!clientId) {
			await contacts.setSelectedContact();
			await channels.setSelectedChannel();
			await storeValue("clientContactRows", [], false);
			await storeValue("contactChannelRows", [], false);
			return [];
		}

		const previousId = contacts.savedContactId || contacts.selectedContact?.id;
		const contactsData = await contacts.getClientContacts(clientId);
		await storeValue("clientContactRows", contactsData, false);

		if (!contactsData.length) {
			await contacts.setSelectedContact();
			await channels.setSelectedChannel();
			await storeValue("contactChannelRows", [], false);
			return [];
		}

		const selected =
			(previousId ? contactsData.find((row) => String(row.id) === String(previousId)) : null) ||
			contactsData[0];

		await contacts.setSelectedContact(selected);
		contacts.savedContactId = undefined;

		const index = contactsData.findIndex((row) => String(row.id) === String(selected.id));
		if (index >= 0) await tbl_contacts.setSelectedRowIndex(index);

		await channels.updateChannelsList(selected.id);
		return contactsData;
	},

	tbl_contacts_onRowSelected: async () => {
		const contact = tbl_contacts.selectedRow;
		if (!contact?.id || String(contacts.selectedContact?.id) === String(contact.id)) return;

		await contacts.setSelectedContact(contact);
		await channels.updateChannelsList(contact.id);
	},

	tbl_contacts_onSave: async () => {
		const clientId = clients.selectedClient?.id;
		if (!clientId) return showAlert("Сначала выберите клиента", "warning");

		try {
			const sourceRow = tbl_contacts.isAddRowInProgress
				? tbl_contacts.newRow
				: (tbl_contacts.updatedRows?.[0] || tbl_contacts.updatedRow || tbl_contacts.selectedRow);

			const row = contacts.normalizeTableRow(sourceRow);
			const name = row.name?.trim();

			if (!name) return showAlert("Укажите контактное лицо", "warning");

			if (tbl_contacts.isAddRowInProgress) {
				const newItem = await items.createItems({
					collection: "client_contacts",
					body: {
						name,
						lpr: Boolean(row.lpr),
						client_id: clientId
					}
				});
				contacts.savedContactId = newItem?.data?.id;
			} else {
				const contactId = row.id || contacts.selectedContact?.id;
				if (!contactId) return showAlert("Не удалось определить контактное лицо", "warning");

				await items.updateItems({
					collection: "client_contacts",
					body: {
						keys: [contactId],
						data: {
							name,
							lpr: Boolean(row.lpr)
						}
					}
				});
				contacts.savedContactId = contactId;
			}

			await contacts.updateContactsList(clientId);
			showAlert("Контактное лицо сохранено", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error in saving contact:", error);
			showAlert("Ошибка сохранения контактного лица", "error");
			throw error;
		}
	},

	tbl_contacts_onDelete: async () => {
		const contactIdToDelete = tbl_contacts.triggeredRow?.id || tbl_contacts.selectedRow?.id;
		if (!contactIdToDelete) return;

		try {
			await items.deleteItems({
				collection: "client_contacts",
				body: {
					query: {
						filter: {
							id: { _eq: contactIdToDelete }
						}
					}
				}
			});

			if (String(contacts.selectedContact?.id) === String(contactIdToDelete)) {
				await contacts.setSelectedContact();
			}

			await contacts.updateContactsList(clients.selectedClient?.id);
			showAlert("Контактное лицо удалено", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error during deleting contact:", error);
			showAlert("Ошибка удаления контактного лица", "error");
			throw error;
		}
	},

	getClientContacts: async (clientId) => {
		if (!clientId) return [];

		try {
			const response = await items.getItems({
				fields: "id,name,lpr,client_id",
				filter: { client_id: { _eq: clientId } },
				collection: "client_contacts",
				limit: -1
			});

			return response.data || [];
		} catch (error) {
			console.error(`Error fetching client contacts for clientId ${clientId}:`, error);
			throw error;
		}
	}
};