export default {
	// Channels js object
	selectedChannel: undefined,
	savedChannelId: undefined,

	normalizeTableRow(row) {
		return { ...(row?.allFields || row || {}), ...(row?.updatedFields || {}) };
	},

	setSelectedChannel: async (channel) => {
		channels.selectedChannel = channel;
		await storeValue("selectedChannel", channel || null, true);
	},

	saveSelectedChannel: async () => {
		channels.savedChannelId = channels.selectedChannel?.id;
	},

	restoreSavedChannelSelection: async () => {
		if (!channels.savedChannelId) return;
		const rows = appsmith.store?.contactChannelRows || tbl_channels.tableData || [];
		const index = rows.findIndex((row) => String(row.id) === String(channels.savedChannelId));

		if (index < 0) {
			channels.savedChannelId = undefined;
			return;
		}

		await tbl_channels.setSelectedRowIndex(index);
		await channels.setSelectedChannel(rows[index]);
		channels.savedChannelId = undefined;
	},

	updateChannelsList: async (contactId = contacts.selectedContact?.id) => {
		if (!contactId) {
			await channels.setSelectedChannel();
			await storeValue("contactChannelRows", [], false);
			return [];
		}

		const previousId = channels.savedChannelId || channels.selectedChannel?.id;
		const channelsData = await channels.getContactChannels(contactId);
		await storeValue("contactChannelRows", channelsData, false);

		if (!channelsData.length) {
			await channels.setSelectedChannel();
			return [];
		}

		const selected =
			(previousId ? channelsData.find((row) => String(row.id) === String(previousId)) : null) ||
			channelsData[0];

		await channels.setSelectedChannel(selected);
		channels.savedChannelId = undefined;

		const index = channelsData.findIndex((row) => String(row.id) === String(selected.id));
		if (index >= 0) await tbl_channels.setSelectedRowIndex(index);

		return channelsData;
	},

	tbl_channels_onRowSelected: async () => {
		const channel = tbl_channels.selectedRow;
		if (!channel?.id || String(channels.selectedChannel?.id) === String(channel.id)) return;

		await channels.setSelectedChannel(channel);
	},

	tbl_channels_onSave: async () => {
		const contactId = contacts.selectedContact?.id;
		if (!contactId) return showAlert("Сначала выберите контактное лицо", "warning");

		try {
			const sourceRow = tbl_channels.isAddRowInProgress
				? tbl_channels.newRow
				: (tbl_channels.updatedRows?.[0] || tbl_channels.updatedRow || tbl_channels.selectedRow);

			const row = channels.normalizeTableRow(sourceRow);
			const channelTypeId = row.channel_type_name || row.channel_type_id;
			const channelId = typeof row.channel_id === "string" ? row.channel_id.trim() : row.channel_id;

			if (!channelTypeId) return showAlert("Выберите тип канала", "warning");
			if (!channelId) return showAlert("Укажите канал связи", "warning");

			if (tbl_channels.isAddRowInProgress) {
				const newItem = await items.createItems({
					collection: "contact_channels",
					body: {
						channel_type_id: channelTypeId,
						channel_id: channelId,
						client_contact_id: contactId
					}
				});
				channels.savedChannelId = newItem?.data?.id;
			} else {
				const channelRecordId = row.id || channels.selectedChannel?.id;
				if (!channelRecordId) return showAlert("Не удалось определить канал связи", "warning");

				await items.updateItems({
					collection: "contact_channels",
					body: {
						keys: [channelRecordId],
						data: {
							channel_type_id: channelTypeId,
							channel_id: channelId,
							client_contact_id: contactId
						}
					}
				});
				channels.savedChannelId = channelRecordId;
			}

			await channels.updateChannelsList(contactId);
			showAlert("Канал коммуникаций сохранен", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error in saving channel:", error);
			showAlert("Ошибка сохранения канала коммуникаций", "error");
			throw error;
		}
	},

	tbl_channel_onDelete: async () => {
		const channelIdToDelete = tbl_channels.triggeredRow?.id || tbl_channels.selectedRow?.id;
		if (!channelIdToDelete) return;

		try {
			await items.deleteItems({
				collection: "contact_channels",
				body: {
					query: {
						filter: {
							id: { _eq: channelIdToDelete }
						}
					}
				}
			});

			if (String(channels.selectedChannel?.id) === String(channelIdToDelete)) {
				await channels.setSelectedChannel();
			}

			await channels.updateChannelsList(contacts.selectedContact?.id);
			showAlert("Канал коммуникаций удален", "success");
		} catch (error) {
			if (error?.authHandled) throw error;
			console.error("Error during deleting channel:", error);
			showAlert("Ошибка удаления канала коммуникаций", "error");
			throw error;
		}
	},

	getChannelsTypes: async () => {
		try {
			const response = await items.getItems({
				fields: "id,name",
				collection: "channel_types",
				limit: -1
			});

			const channelTypes = (response.data || []).map((item) => ({
				label: item.name,
				value: item.id
			}));

			await storeValue("channelTypeOptions", channelTypes, false);
			return channelTypes;
		} catch (error) {
			console.error("Error fetching channels types", error);
			throw error;
		}
	},

	getContactChannels: async (contactId) => {
		if (!contactId) return [];

		try {
			const response = await items.getItems({
				fields: "id,channel_id,channel_type_id.id,channel_type_id.name",
				filter: { client_contact_id: { _eq: contactId } },
				collection: "contact_channels",
				limit: -1
			});

			return (response.data || []).map((item) => ({
				id: item.id,
				channel_id: item.channel_id || "",
				channel_type_id: item.channel_type_id?.id ?? item.channel_type_id ?? null,
				channel_type_name: item.channel_type_id?.name || ""
			}));
		} catch (error) {
			console.error(`Error fetching contact channels for contactId ${contactId}:`, error);
			throw error;
		}
	}
};