export default {
	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, `${first}${middle}`].filter(Boolean).join(" ").trim();
	},

	addAuditAction: async (params = {}, legacyTaskId, legacyCommentId, legacyClientId) => {
		const payload = typeof params === "string"
		? { action: params, taskId: legacyTaskId, commentId: legacyCommentId, clientId: legacyClientId }
		: params;

		if (!payload?.action || !appsmith.store?.user?.id) return;

		try {
			await items.createItems({
				collection: "tasklog",
				body: {
					user_id: appsmith.store.user.id,
					action: payload.action,
					task_id: payload.taskId,
					comment_id: payload.commentId,
					client_id: payload.clientId
				}
			});
		} catch (error) {
			console.error("Error in saving activity log:", error);
		}
	},

	GetUsersOfficeTerms: async () => {
		const fields = [
			"id",
			"date_from",
			"date_till",
			"user_id.id",
			"user_id.first_name",
			"user_id.middle_name",
			"user_id.last_name",
			"position_id.id",
			"position_id.position_title_id.id",
			"position_id.position_title_id.title",
			"position_id.branch_id.id",
			"position_id.branch_id.name"
		].join(",");

		const today = moment().format("YYYY-MM-DD");
		const params = {
			fields: fields,
			collection: "office_terms",
			filter: {
				_and: [
					{ date_from: { _lte: today } },
					{ _or: [{ date_till: { _null: true } }, { date_till: { _gte: today } }] }
				]
			},
			limit: -1
		};

		try {
			const response = await items.getItems(params);
			const contactsByUserId = new Map();

			(response.data || []).forEach((item) => {
				const user = item?.user_id;
				const position = item?.position_id;
				if (!user?.id) return;

				const existing = contactsByUserId.get(user.id) || {
					id: user.id,
					last_name: user.last_name || "",
					first_name: user.first_name || "",
					middle_name: user.middle_name || "",
					initials: user.first_name?.[0] ? `${user.first_name[0]}.` : "",
					position_title_id: "",
					position_title_ids: [],
					title: "",
					titles: [],
					branch_id: "",
					branch_ids: [],
					branch_name: "",
					branch_names: [],
					label: utils.formatUserName(user)
				};

				const positionTitleId = position?.position_title_id?.id || "";
				const title = position?.position_title_id?.title || "";
				const branchId = position?.branch_id?.id || "";
				const branchName = position?.branch_id?.name || "";

				if (positionTitleId && !existing.position_title_ids.some((id) => String(id) === String(positionTitleId))) {
					existing.position_title_ids.push(positionTitleId);
				}
				if (title && !existing.titles.includes(title)) existing.titles.push(title);
				if (branchId && !existing.branch_ids.some((id) => String(id) === String(branchId))) {
					existing.branch_ids.push(branchId);
				}
				if (branchName && !existing.branch_names.includes(branchName)) existing.branch_names.push(branchName);

				existing.position_title_id = existing.position_title_ids[0] || "";
				existing.title = existing.titles.join(", ");
				existing.branch_id = existing.branch_ids[0] || "";
				existing.branch_name = existing.branch_names.join(", ");

				contactsByUserId.set(user.id, existing);
			});

			const contacts = Array.from(contactsByUserId.values())
			.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
			return contacts;
		} catch (error) {
			console.error("Error fetching office terms:", error);
			throw error;
		}
	},

	// for auditors and participants
	getNamesFromArray: (usersArray) => {
		if (!Array.isArray(usersArray) || !usersArray.length) return "";
		return usersArray
			.map((participant) => utils.formatUserName(participant?.directus_users_id))
			.filter(Boolean)
			.join(", ");
	},

	getClientLog: async () => {
		if (!clients.selectedClient) {
			return;
		}
		const clientId = clients.selectedClient.id;
		const params = {
			fields: "*,user_id.last_name,user_id.first_name,user_id.middle_name",
			filter: JSON.stringify({ client_id: { _eq: clientId } }),
			collection: "tasklog"
		};

		try {
			const response = await items.getItems(params);

			return response.data || [];
		} catch (error) {
			console.error(`Error fetching logs for client ${clientId}:`, error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	formatBytes: async (bytes, decimals = 2) => {
		if (bytes === 0) return '0 B';

		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));

		return `${value} ${sizes[i]}`;
	}
}