export default {
	// Channels js object
	selectedChannel: undefined,
	savedChannelId: undefined,			// keep last selected channel id for restoring later

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
		// await contacts.updateContactsList(clients.selectedClient.id);
		// let a = contacts.selectedContact;
		// let b = contacts.savedContactId;
		return channels.getContactChannels(58);
	},

	Test1: async () => {
		this.updateChannelsList(59);
	},

	/// ============================= end of test block ============================

	updateChannelsList: async (contactId) => {
		if (channels.selectedChannel && !channels.savedChannelId) {
			// keeping last selectedItem for restoring last state if we cancel adding task			
			await channels.saveSelectedChannel();
		}
		const channelsData = await channels.getContactChannels(contactId);
		await tbl_channels.setData(channelsData);
		// if channel exist - restore previously selected channel or first one
		if (channelsData.length > 0 ) {
			if (!channels.savedChannelId) {	
				if (!channels.selectedChannel){
					//	set first channel as active
					channels.savedChannelId = channelsData[0].id;	
				} else {
					// save current channel
					channels.savedChannelId = channels.selectedChannel.id;
				}
			}
			await channels.restoreSavedChannelSelection();
			// await clients.tbs_client_onTabSelected();
		}

		return;
	},

	restoreSavedChannelSelection: async () => { 
		const index = tbl_channels.tableData.findIndex(row => row.id === this.savedChannelId);
		const curRow = await tbl_channels.setSelectedRowIndex(index);
		this.selectedChannel = tbl_channels.tableData[curRow];
		this.savedChannelId = undefined;
	},

	tbl_channel_onDelete: async () => {
		const channelIdToDelete = tbl_channels.triggeredRow.id;
		try {
			items.deleteItems({
				collection: "contact_channels",
				body: {
					query: {
						filter: {
							id: { "_eq": channelIdToDelete }
						}
					}
				}
			})
		} catch (error) {
			// General catch for the entire operation
			console.error("Error during deleting channel:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}

		//  if deleting channel is selected then clear selection
		if (this.selectedChannel.id == channelIdToDelete) {
			this.setSelectedChannel();
		}
		if (contacts.selectedContact?.id){
			await this.updateChannelsList(contacts.selectedContact.id);
		}
		return;
	},

	tbl_channels_onRowSelected: async () => {
		// showAlert('tbl_contacts_onRowSelected: ' + tbl_contacts.selectedRowIndex, 'info');
		// console.log("tbl_contacts.selectedRowIndex: ", tbl_contacts.selectedRowIndex);
		if (tbl_channels.selectedRowIndex == -1) {
			return;
		}
		const channel =  channels.getContactChannels.data[tbl_channels.selectedRowIndex];
		if (this.selectedChannel?.id == channel.id) {
			// clicking same contact shouldn't reload channels
			return;
		}
		await this.setSelectedChannel(channel);
		// utils.addAuditAction({action: 'client_view', clientId: tbl_clients.selectedRow.id});
	},

	tbl_channels_onSave: async () => {
		if (!this.selectedChannel?.id){
			showAlert('selectedChannel.id is empty...', 'error');
			return;
		}
		const contactId = contacts.selectedContact.id;
		try {
			showAlert('Сохраняем канал коммуникаций...', 'info');
			console.log("tbl_channels.newRow", tbl_channels.newRow);
			let body;
			// adding new contact channel
			if (tbl_channels.isAddRowInProgress) {
				body = {
					channel_type_id: tbl_channels.newRow.channel_type_name,
					channel_id: tbl_channels.newRow.channel_id,
					client_contact_id: contactId
				};
				const params = {
					collection: "contact_channels",
					body: body
				}

				const newItem = await items.createItems(params);
				this.savedChannelId = newItem.data.id;

			} else {	// editing existing contact
				body = {
					keys: [channels.selectedChannel.id],
					data: {	
						channel_type_id: tbl_channels.updatedRow.channel_type_id,
						channel_id: tbl_channels.updatedRow.channel_id,
						client_contact_id: contactId
					}
				};
				const params = { collection: "contact_channels",	body: body };
				await items.updateItems(params);
			}

			await channels.updateChannelsList(contactId);

			showAlert('Канал коммуникаций сохранен!', 'success');
		} catch (error) {
			// General catch for the entire operation
			console.error("Error in creating channel:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	setSelectedChannel: async (channel) => {
		this.selectedChannel = channel;
	},

	saveSelectedChannel: async () => {
		if (this.savedChannelId) {
			showAlert('There is saved channelId', 'error');
			return;
		}
		this.savedChannelId = this.selectedChannel.id;
	},

	getChannelsTypes: async () => {
		// Define the fields to include in the response
		const fields = [
			"id", "name"
		].join(",");


		const params = {
			fields: fields,
			collection: "channel_types"
		};

		try {
			const response = await items.getItems(params);
			const responseData = response.data;

			const сhannelsTypes = responseData.flat().map(item => ({
				label: item.name,
				value: item.id
			}));

			return сhannelsTypes;
		} catch (error) {
			console.error(`Error fetching channels types`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	getContactChannels: async (contactId) => {
		if (!contactId) {
			showAlert('Contact ID not defined, so do exit from getContactChannels', 'info');
			return;
		}
		// Define the fields to include in the response
		const fields = [
			"id", "channel_id",
			"channel_type.id", "channel_type.name",
			"channel_type_id.id","channel_type_id.name"
		].join(",");

		const filter = { "client_contact_id": {	"_eq": contactId }};

		const params = {
			fields: fields,
			filter: filter,
			collection: "contact_channels"
		};

		try {
			const response = await items.getItems(params);
			const contactChannels = response.data;
			const flattenedChannels = contactChannels.map(item => ({
				id: item.id,
				channel_id: item.channel_id,
				channel_type_id: item.channel_type_id?.id,
				channel_type_name: item.channel_type_id?.name
			}));

			return flattenedChannels;
		} catch (error) {
			console.error(`Error fetching clients`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}