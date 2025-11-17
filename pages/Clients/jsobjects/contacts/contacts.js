export default {
	// Contacts js object
	selectedContact: undefined,
	// selectedContactClientId: undefined,		// for keeping last selected contact's client id
	savedContactId: undefined,			// for keeping last selected contact id for restoring later
	// savedContactClientId: undefined,		// for keeping last selected contact's client id

	/// ================================= test block =================================
	Test: async () => {
		// showAlert('Yep', 'info');
		// console.log("selectedContact: ", this.selectedContact);
		// console.log("savedContactId: ", this.savedContact);
		// // await contacts.setSelectedContact(19);
		// this.savedContact = 21;
		// // await contacts.saveSelectedContactID();
		// // await contacts.updateContactsList(clientId);
		// await contacts.restoreSavedContactSelection();
		await contacts.updateContactsList(clients.selectedClient.id);
		let a = contacts.selectedContact;
		let b = contacts.savedContactId;

	},

	/// ============================= end of test block ============================

	tbl_contacts_onRowSelected: async () => {
		// showAlert('tbl_contacts_onRowSelected: ' + tbl_contacts.selectedRowIndex, 'info');
		// console.log("tbl_contacts.selectedRowIndex: ", tbl_contacts.selectedRowIndex);
		if (tbl_contacts.selectedRowIndex == -1) {
			return;
		}
		const contact =  contacts.getClientContacts.data[tbl_contacts.selectedRowIndex];
		if (this.selectedContact?.id == contact.id) {
			// clicking same contact shouldn't reload channels
			return;
		}
		await contacts.setSelectedContact(contact);
		channels.updateChannelsList(contact.id);
		// utils.addAuditAction({action: 'client_view', clientId: tbl_clients.selectedRow.id});
	},


	updateContactsList: async (clientId) => {
		if (contacts.selectedContact && !contacts.savedContactId) {
			// keeping last selectedItem for restoring last state if we cancel adding task			
			await contacts.saveSelectedContact();
		}
		const contactsData = await contacts.getClientContacts(clientId);
		await tbl_contacts.setData(contactsData);
		// if contacts exist - restore previously selected contact or first one
		if (contactsData.length > 0 ) {
			if (!contacts.savedContactId) {	
				if (!contacts.selectedContact){
					//	set first client as active
					console.log("contacts.savedContactId = contactsData[0].id;");
					contacts.savedContactId = contactsData[0].id;	
				} else {
					// save current contact
					console.log("contacts.savedContactId = contacts.selectedContact.id;");
					contacts.savedContactId = contacts.selectedContact.id;
				}
			}
			console.log("selectedContact: ", contacts.selectedContact);
			console.log("savedContactId: ", contacts.savedContactId);

			await contacts.restoreSavedContactSelection();
			channels.updateChannelsList(this.selectedContact.id);
			// await clients.tbs_client_onTabSelected();
		}

		return;
	},

	tbl_contacts_onSave: async () => {
		if (!clients.selectedClient.id){
			showAlert('selectedClient.id is empty...', 'error');
			return;
		}
		const clientId = clients.selectedClient.id;
		try {
			showAlert('Сохраняем контактное лицо...', 'info');

			let body;
			// adding new contact
			if (tbl_contacts.isAddRowInProgress) {
				body = {
					name: tbl_contacts.newRow.name,
					lpr: tbl_contacts.newRow.lpr,
					client_id: clientId
				};
				const params = {
					collection: "client_contacts",
					body: body
				}

				const newItem = await items.createItems(params);
				contacts.savedContactId = newItem.data.id;

			} else {	// editing existing contact
				body = {
					keys: [contacts.selectedContact.id],
					data: {	
						name: tbl_contacts.updatedRow.name,
						lpr: tbl_contacts.updatedRow.lpr
					}
				};
				const params = { collection: "client_contacts",	body: body };
				await items.updateItems(params);
			}

			await contacts.updateContactsList(clientId);
			// await contacts.restoreSavedContactSelection();

			// 6. Finalize
			// - await utils.addAuditAction('client_add', undefined, undefined, clients.selectedItem.id);

			showAlert('Контактное лицо сохранено!', 'success');
		} catch (error) {
			// General catch for the entire operation
			console.error("Error in creating contact:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	tbl_contacts_onDelete: async () => {
		const contactIdToDelete = tbl_contacts.triggeredRow.id;
		try {
			items.deleteItems({
				collection: "client_contacts",
				body: {	query: { filter: { id: { "_eq": contactIdToDelete }	}	}	}
			})
		} catch (error) {
			// General catch for the entire operation
			console.error("Error during deleting contact:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}

		// check if deleting contact is selected and clear selection
		if (this.selectedContact.id == contactIdToDelete) {
			contacts.setSelectedContact();
		}
		if (clients.selectedClient?.id){
			await contacts.updateContactsList(clients.selectedClient.id);
		}
		return;
	},

	setSelectedContact: async (contact) => {
		this.selectedContact = contact;
		// this.selectedContactClient = clients.selectedClient.id;
		// this.selectedContactClientId = contact.id;
	},

	saveSelectedContact: async () => {
		if (this.savedContactId) {
			showAlert('There is saved contactId', 'error');
			return;
		}
		this.savedContactId = this.selectedContact.id;
	},

	restoreSavedContactSelection: async () => { 
		const index = tbl_contacts.tableData.findIndex(row => row.id === this.savedContactId);
		const curRow = await tbl_contacts.setSelectedRowIndex(index);
		this.selectedContact = tbl_contacts.tableData[curRow];
		this.savedContactId = undefined;
	},

	getClientContacts: async (clientId) => {
		if (!clientId) {
			console.error("No clientId provided");
			return [];
		}

		const params = {
			fields: "id,name,lpr,client.id",
			filter: JSON.stringify({ client_id: { _eq: clientId } }),
			collection: "client_contacts"
		};

		try {
			const response = await items.getItems(params);
			return response.data || [];
		} catch (error) {
			console.error(`Error fetching client contacts for clientId ${clientId}:`, error);
			throw error;
		}
	}
}