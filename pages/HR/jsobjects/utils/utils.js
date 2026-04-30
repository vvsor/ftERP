export default {
	/// ================== test block ==================
	// test: async () => {
	// },
	/// ============== end of test block ===============

	async getPositionsByBranch({ commitToStore = true } = {}) {
		const branchId = appsmith.store?.hrSelectedBranchId;
		if (!branchId) {
			if (commitToStore) await storeValue("hrPositionRows", [], false);
			return [];
		}

		const today = moment().format("YYYY-MM-DD");

		const [positionsRes, officeTermsRes] = await Promise.all([
			items.getItems({
				collection: "positions",
				fields: [
					"id",
					"title_id.title",
					"branch_id.id",
					"branch_id.name"
				].join(","),
				filter: {
					branch_id: { id: { _eq: branchId } }
				},
				limit: -1
			}),
			items.getItems({
				collection: "office_term",
				fields: [
					"id",
					"date_from",
					"date_till",
					"user_id.id",
					"user_id.first_name",
					"user_id.last_name",
					"position_id.id"
				].join(","),
				filter: {
					_and: [
						{ position_id: { branch_id: { id: { _eq: branchId } } } },
						{ date_from: { _lte: today } },
						{
							_or: [
								{ date_till: { _null: true } },
								{ date_till: { _gte: today } }
							]
						}
					]
				},
				limit: -1
			})
		]);

		const employeeByPositionId = {};

		for (const row of (officeTermsRes.data || [])) {
			const positionId = row?.position_id?.id ?? row?.position_id;
			const user = row?.user_id;

			if (!positionId || !user?.id) continue;

			const current = employeeByPositionId[positionId];
			const currentDate = current?.date_from || "";
			const nextDate = row.date_from || "";

			if (!current || nextDate > currentDate) {
				employeeByPositionId[positionId] = {
					office_term_id: row.id,
					user_id: user.id,
					employee: utils.formatUserName(user),
					date_from: row.date_from,
					date_till: row.date_till
				};
			}
		}

		const rows = (positionsRes.data || [])
		.map((position) => {
			const employee = employeeByPositionId[position.id] || {};
			return {
				id: position.id,
				title: position.title_id?.title || "",
				employee: employee.employee || "",
				user_id: employee.user_id || null,
				office_term_id: employee.office_term_id || null,
				date_from: employee.date_from || null,
				date_till: employee.date_till || null,
				branch_id: position.branch_id?.id ?? branchId,
				branch_name: position.branch_id?.name || ""
			};
		})
		.sort((a, b) => a.title.localeCompare(b.title));

		if (commitToStore) {
			await storeValue("hrPositionRows", rows, false);
		}

		return rows;
	},

	async getBranches() {
		try {
			// Fields to fetch
			const fields = [
				"*"
			].join(",");

			const params = {
				fields: fields,
				collection: "branches",
			};
			const response = await items.getItems(params);
			const allBranches = response.data || [];
			allBranches.sort((a, b) => a.name.localeCompare(b.name));

			await storeValue("hrBranchRows", allBranches, true);
			return allBranches;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	async getBranchAccountsRaw() {
		try {
			// Fields to fetch
			const fields = [
				"id", "name", "type"
			].join(",");

			const params = {
				fields: fields,
				collection: "branch_accounts",
			};
			const response = await items.getItems(params);
			const allBranches = response.data || [];
			// Sort by name (ascending)
			allBranches.sort((a, b) => a.name.localeCompare(b.name));
			return allBranches;
		} catch (error) {
			console.error("Error in all task processing:", error);
			throw error;
		}
	},

	async getBranchAccountsOptions() {
		const rows = await this.getBranchAccountsRaw();

		return rows.map(x => ({
			label: x.name,
			value: x.id,
		}));
	},
	async getOfficeTermHistoryByUser(userId, { commitToStore = true } = {}) {
		if (!userId) {
			if (commitToStore) await storeValue("hrOfficeTermHistoryRows", [], false);
			return [];
		}

		const today = moment().format("YYYY-MM-DD");

		const response = await items.getItems({
			collection: "office_term",
			fields: [
				"id",
				"date_from",
				"date_till",
				"user_id.id",
				"user_id.first_name",
				"user_id.last_name",
				"position_id.id",
				"position_id.title_id.title",
				"position_id.branch_id.id",
				"position_id.branch_id.name"
			].join(","),
			filter: {
				user_id: { id: { _eq: userId } }
			},
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => {
			const position = row?.position_id || {};
			const isCurrent =
						(!row.date_from || row.date_from <= today) &&
						(!row.date_till || row.date_till >= today);

			return {
				id: row.id,
				office_term_id: row.id,
				user_id: row?.user_id?.id || userId,
				employee: utils.formatUserName(row?.user_id),
				position_id: position?.id || null,
				title: position?.title_id?.title || "",
				branch_id: position?.branch_id?.id || null,
				branch_name: position?.branch_id?.name || "",
				date_from: row.date_from || null,
				date_till: row.date_till || null,
				date_from_display: row.date_from ? moment(row.date_from).format("DD.MM.YYYY") : "",
				date_till_display: row.date_till ? moment(row.date_till).format("DD.MM.YYYY") : "по настоящее время",
				status: isCurrent ? "Сейчас" : "История",
				is_current: isCurrent
			};
		})
		.sort((a, b) => {
			if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
			return String(b.date_from || "").localeCompare(String(a.date_from || ""));
		});

		if (commitToStore) {
			await storeValue("hrOfficeTermHistoryRows", rows, false);
		}

		return rows;
	},

	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name;
		const first = user.first_name?.[0];
		return `${last} ${first}.`;
	}

}