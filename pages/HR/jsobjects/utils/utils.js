export default {
	/// ================== test block ==================
	// test: async () => {
	// },
	/// ============== end of test block ===============

	async getPositionsByBranch({ commitToStore = true } = {}) {
		const branchId = appsmith.store?.hrSelectedBranchId || "";
		const today = moment().format("YYYY-MM-DD");

		const positionFilter = branchId ? { branch_id: { id: { _eq: branchId } } } : {};
		const officeTermsFilter = {
			_and: [
				...(branchId ? [{ position_id: { branch_id: { id: { _eq: branchId } } } }] : []),
				{ date_from: { _lte: today } },
				{
					_or: [
						{ date_till: { _null: true } },
						{ date_till: { _gte: today } }
					]
				}
			]
		};

		const [positionsRes, officeTermsRes] = await Promise.all([
			items.getItems({
				collection: "positions",
				fields: [
					"id",
					"position_title_id.id",
					"position_title_id.title",
					"branch_id.id",
					"branch_id.name",
					"supervisor_position_id.id",
					"supervisor_position_id.position_title_id.title",
					"comment"
				].join(","),
				filter: positionFilter,
				limit: -1
			}),
			items.getItems({
				collection: "office_terms",
				fields: [
					"id",
					"date_from",
					"date_till",
					"comment",
					"user_id.id",
					"user_id.first_name",
					"user_id.middle_name",
					"user_id.last_name",
					"user_id.email",
					"user_id.role",
					"position_id.id"
				].join(","),
				filter: officeTermsFilter,
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
					first_name: user.first_name || "",
					last_name: user.last_name || "",
					middle_name: user.middle_name || "",
					email: user.email || "",
					role: user.role?.id ?? user.role ?? "",
					date_from: row.date_from,
					date_till: row.date_till
				};
			}
		}

		const rows = (positionsRes.data || [])
		.map((position) => {
			const employee = employeeByPositionId[position.id] || {};
			const supervisorPosition = position.supervisor_position_id || {};
			const supervisorPositionId = supervisorPosition?.id ?? position.supervisor_position_id ?? null;
			const supervisorEmployee = employeeByPositionId[supervisorPositionId] || {};
			const supervisorTitle = supervisorPosition?.position_title_id?.title || "";

			return {
				id: position.id,
				title: position.position_title_id?.title || "",
				employee: employee.employee || "",
				first_name: employee.first_name || "",
				last_name: employee.last_name || "",
				middle_name: employee.middle_name || "",
				email: employee.email || "",
				role: employee.role || "",
				user_id: employee.user_id || null,
				office_term_id: employee.office_term_id || null,
				date_from: employee.date_from || null,
				date_till: employee.date_till || null,
				comment: position.comment || "",
				branch_id: position.branch_id?.id ?? null,
				branch_name: position.branch_id?.name || "",
				position_title_id: position.position_title_id?.id ?? position.position_title_id ?? null,
				supervisor_position_id: supervisorPositionId,
				supervisor_title: supervisorTitle,
				supervisor_employee: supervisorEmployee.employee || "",
				supervisor_display: [supervisorTitle, supervisorEmployee.employee].filter(Boolean).join(" - ")
			};
		})
		.sort((a, b) => {
			const branchCompare = String(a.branch_name || "").localeCompare(String(b.branch_name || ""));
			return branchCompare || String(a.title || "").localeCompare(String(b.title || ""));
		});

		if (commitToStore) {
			await storeValue("hrPositionRows", rows, false);
		}

		return rows;
	},

	async getEmployees({ commitToStore = true } = {}) {
		const today = moment().format("YYYY-MM-DD");

		const [usersRes, officeTermsRes] = await Promise.all([
			items.getUsers({
				fields: "id,first_name,last_name,middle_name,email,role",
				limit: -1
			}),
			items.getItems({
				collection: "office_terms",
				fields: [
					"id",
					"date_from",
					"date_till",
					"comment",
					"user_id.id",
					"position_id.id",
					"position_id.position_title_id.title",
					"position_id.branch_id.id",
					"position_id.branch_id.name"
				].join(","),
				filter: {
					_and: [
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

		const termsByUserId = {};
		for (const term of (officeTermsRes.data || [])) {
			const userId = term?.user_id?.id ?? term?.user_id;
			if (!userId) continue;
			if (!termsByUserId[userId]) termsByUserId[userId] = [];
			termsByUserId[userId].push(term);
		}

		const rows = (usersRes.data || []).map((user) => {
			const terms = termsByUserId[user.id] || [];
			const titles = terms.map((term) => term?.position_id?.position_title_id?.title).filter(Boolean);
			const branches = terms.map((term) => term?.position_id?.branch_id?.name).filter(Boolean);
			const branchIds = terms.map((term) => term?.position_id?.branch_id?.id ?? term?.position_id?.branch_id).filter(Boolean);

			return {
				id: user.id,
				user_id: user.id,
				employee: utils.formatUserName(user),
				first_name: user.first_name || "",
				last_name: user.last_name || "",
				middle_name: user.middle_name || "",
				email: user.email || "",
				role: user.role?.id ?? user.role ?? "",
				title: titles.join(", "),
				branch_name: branches.join(", "),
				office_term_ids: terms.map((term) => term.id),
				position_ids: terms.map((term) => term?.position_id?.id ?? term?.position_id).filter(Boolean),
				branch_ids: [...new Set(branchIds)]
			};
		}).sort((a, b) => String(a.employee || "").localeCompare(String(b.employee || "")));

		if (commitToStore) await storeValue("hrEmployeeRows", rows, false);
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
			collection: "office_terms",
			fields: [
				"id",
				"date_from",
				"date_till",
				"comment",
				"user_id.id",
				"user_id.first_name",
				"user_id.middle_name",
				"user_id.last_name",
				"position_id.id",
				"position_id.position_title_id.title",
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
				title: position?.position_title_id?.title || "",
				branch_id: position?.branch_id?.id || null,
				branch_name: position?.branch_id?.name || "",
				date_from: row.date_from || null,
				date_till: row.date_till || null,
				comment: row.comment || "",
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
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, [first, middle].filter(Boolean).join(" ")].filter(Boolean).join(" ").trim();
	},

	async loadDictionaries() {
		await Promise.all([
			utils.getPositionTitleRows(),
			utils.getPositionOptions(),
			utils.getCityRows(),
			utils.getBranchDirectoryRows()
		]);
	},

	async getPositionOptions() {
		const response = await items.getItems({
			collection: "positions",
			fields: "id,position_title_id.title,branch_id.name",
			limit: -1
		});

		const rows = (response.data || []).map((position) => ({
			label: `${position?.position_title_id?.title || "Без названия"}${position?.branch_id?.name ? ` (${position.branch_id.name})` : ""}`,
			value: position.id
		})).sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

		await storeValue("hrPositionOptions", rows, false);
		return rows;
	},

	async getPositionTitleRows() {
		const response = await items.getItems({
			collection: "position_titles",
			fields: "id,title",
			limit: -1
		});
		const rows = (response.data || []).sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
		await storeValue("hrPositionTitleRows", rows, false);
		return rows;
	},

	async getCityRows() {
		const response = await items.getItems({
			collection: "cities",
			fields: "id,name",
			limit: -1
		});
		const rows = (response.data || []).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
		await storeValue("hrCityRows", rows, false);
		return rows;
	},

	async getBranchDirectoryRows() {
		const response = await items.getItems({
			collection: "branches",
			fields: "id,name,city_id.id,city_id.name",
			limit: -1
		});
		const rows = (response.data || []).map((row) => ({
			id: row.id,
			name: row.name || "",
			city_id: row.city_id?.id ?? row.city_id ?? null,
			city: row.city_id?.name || ""
		})).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
		await storeValue("hrBranchDirectoryRows", rows, false);
		return rows;
	}

}