export default {
	/// ================== test block ==================
	// test: async () => {
	// },
	/// ============== end of test block ===============

	currentOfficeTermsPromise: null,

	async getCurrentOfficeTerms({ commitToStore = true } = {}) {
		if (utils.currentOfficeTermsPromise) return await utils.currentOfficeTermsPromise;

		utils.currentOfficeTermsPromise = (async () => {
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
					"user_id.email",
					"user_id.role",
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
			});

			const rows = response.data || [];
			if (commitToStore) await storeValue("hrCurrentOfficeTerms", rows, false);
			return rows;
		})();

		try {
			return await utils.currentOfficeTermsPromise;
		} finally {
			utils.currentOfficeTermsPromise = null;
		}
	},

	async getPositionsByBranch({ commitToStore = true } = {}) {
		const branchId = appsmith.store?.hrSelectedBranchId || "";
		const positionFilter = branchId ? { branch_id: { id: { _eq: branchId } } } : {};

		const [positionsRes, officeTerms] = await Promise.all([
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
			Array.isArray(appsmith.store?.hrCurrentOfficeTerms)
			? appsmith.store.hrCurrentOfficeTerms
			: utils.getCurrentOfficeTerms()
		]);

		const employeeByPositionId = {};

		for (const row of officeTerms) {
			const positionId = row?.position_id?.id ?? row?.position_id;
			const user = row?.user_id;

			if (!positionId || !user?.id) continue;

			const current = employeeByPositionId[positionId];
			const currentDate = current?.date_from || "";
			const nextDate = row.date_from || "";
			const roleId = user.role?.id ?? user.role ?? "";

			if (!current || nextDate > currentDate) {
				employeeByPositionId[positionId] = {
					office_term_id: row.id,
					user_id: user.id,
					employee: utils.formatUserName(user),
					first_name: user.first_name || "",
					last_name: user.last_name || "",
					middle_name: user.middle_name || "",
					email: user.email || "",
					role: roleId,
					role_label: utils.formatRoleName(user.role),
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
				role_label: employee.role_label || "",
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

		if (commitToStore) await storeValue("hrPositionRows", rows, false);
		return rows;
	},

	async getEmployees({ commitToStore = true } = {}) {
		const [usersRes, officeTerms] = await Promise.all([
			items.getUsers({
				fields: "id,first_name,last_name,middle_name,email,status,role.id,role.name,policies.id,policies.policy.id,policies.policy.name",
				filter: { role: { name: { _in: ["Employees", "Employee with AppSmith"] } } },
				limit: -1
			}),
			Array.isArray(appsmith.store?.hrCurrentOfficeTerms)
			? appsmith.store.hrCurrentOfficeTerms
			: utils.getCurrentOfficeTerms()
		]);

		const termsByUserId = {};
		for (const term of officeTerms) {
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
			const roleId = user.role?.id ?? user.role ?? "";
			const policyLinks = (user.policies || [])
			.map((item) => ({
				id: item?.id || null,
				policy_id: item?.policy?.id ?? item?.policy ?? null,
				policy_name: item?.policy?.name || ""
			}))
			.filter((item) => item.policy_id);

			const policyIds = policyLinks.map((item) => item.policy_id);

			return {
				id: user.id,
				user_id: user.id,
				employee: utils.formatUserName(user),
				first_name: user.first_name || "",
				last_name: user.last_name || "",
				middle_name: user.middle_name || "",
				email: user.email || "",
				role: roleId,
				role_label: utils.formatRoleName(user.role),
				title: titles.join(", "),
				branch_name: branches.join(", "),
				office_term_ids: terms.map((term) => term.id),
				position_ids: terms.map((term) => term?.position_id?.id ?? term?.position_id).filter(Boolean),
				branch_ids: [...new Set(branchIds)],
				status: user.status || "",
				policies: policyIds,
				policy_links: policyLinks,
				policy_labels: (user.policies || [])
				.map((item) => item?.policy?.name)
				.filter(Boolean)
				.join(", "),
			};
		}).sort((a, b) => String(a.employee || "").localeCompare(String(b.employee || "")));

		if (commitToStore) await storeValue("hrEmployeeRows", rows, false);
		return rows;
	},

	async getBranches({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "branches",
			fields: "id,name,city_id.id,city_id.name",
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => ({
			id: row.id,
			name: row.name || "",
			city_id: row.city_id?.id ?? row.city_id ?? null,
			city: row.city_id?.name || ""
		}))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

		if (commitToStore) {
			await storeValue("hrBranchRows", rows, true);
		}

		return rows;
	},

	async getOfficeTermHistoryByUser(userId, options = {}) {
		return await this.getOfficeTermHistory({
			userId,
			storeKey: "hrEmployeeOfficeTermHistoryRows",
			...options
		});
	},

	async getOfficeTermHistory({ userId = null, positionId = null, commitToStore = true, storeKey = "hrOfficeTermHistoryRows" } = {}) {
		if (!userId && !positionId) {
			if (commitToStore) await storeValue(storeKey, [], false);
			return [];
		}

		const today = moment().format("YYYY-MM-DD");
		const filterParts = [
			...(userId ? [{ user_id: { id: { _eq: userId } } }] : []),
			...(positionId ? [{ position_id: { id: { _eq: positionId } } }] : [])
		];

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
			filter: filterParts.length === 1 ? filterParts[0] : { _and: filterParts },
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
				user_id: row?.user_id?.id || userId || null,
				employee: utils.formatUserName(row?.user_id),
				position_id: position?.id || positionId || null,
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
			await storeValue(storeKey, rows, false);
		}

		return rows;
	},

	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name || "";
		const first = user.first_name?.[0] ? `${user.first_name[0]}.` : "";
		const middle = user.middle_name?.[0] ? `${user.middle_name[0]}.` : "";
		return [last, `${first}${middle}`].filter(Boolean).join(" ").trim();
	},

	async getPolicies({ commitToStore = true } = {}) {
		const response = await items.getPolicies({
			fields: "id,name",
			filter: { name: { _ends_with: " Users" } },
			limit: -1
		});

		const rows = (response.data || [])
		.map((policy) => ({
			label: policy.name || policy.id,
			value: policy.id
		}))
		.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

		if (commitToStore) await storeValue("hrPolicyOptions", rows, false);
		return rows;
	},

	async getRoles({ commitToStore = true } = {}) {
		const allowedRoleNames = ["Employees", "Employee with AppSmith"];

		const response = await items.getRoles({
			fields: "id,name",
			filter: { name: { _in: allowedRoleNames } },
			limit: -1
		});

		const rows = (response.data || [])
		.map((role) => ({
			label: role.name || role.id,
			value: role.id
		}))
		.sort((a, b) => {
			const aIndex = allowedRoleNames.indexOf(a.label);
			const bIndex = allowedRoleNames.indexOf(b.label);
			return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
		});

		if (commitToStore) await storeValue("hrRoleOptions", rows, false);
		return rows;
	},

	formatRoleName(role) {
		const value = role?.id ?? role ?? "";
		const name = role?.name || role?.label || "";
		if (name) return name;

		const options = Array.isArray(appsmith.store?.hrRoleOptions) ? appsmith.store.hrRoleOptions : [];
		return options.find((item) => String(item.value) === String(value))?.label || value || "";
	},

	async loadDictionaries() {
		await Promise.all([
			utils.getRoles(),
			utils.getPositionTitleRows(),
			utils.getCityRows(),
			utils.getBranches(),
			utils.getPolicies()
		]);
	},

	async getSupervisorPositionOptions({ commitToStore = true } = {}) {
		const [positionsRes, officeTerms] = await Promise.all([
			items.getItems({
				collection: "positions",
				fields: [
					"id",
					"position_title_id.id",
					"position_title_id.title",
					"branch_id.id",
					"branch_id.name",
					"supervisor_position_id.id"
				].join(","),
				limit: -1
			}),
			Array.isArray(appsmith.store?.hrCurrentOfficeTerms)
			? appsmith.store.hrCurrentOfficeTerms
			: utils.getCurrentOfficeTerms()
		]);

		const employeeByPositionId = {};
		for (const term of officeTerms || []) {
			const positionId = term?.position_id?.id ?? term?.position_id;
			const user = term?.user_id;
			if (!positionId || !user?.id) continue;

			const current = employeeByPositionId[positionId];
			if (!current || String(term.date_from || "") > String(current.date_from || "")) {
				employeeByPositionId[positionId] = {
					employee: utils.formatUserName(user),
					date_from: term.date_from || ""
				};
			}
		}

		const options = (positionsRes.data || [])
		.map((position) => {
			const id = position.id;
			const title = position.position_title_id?.title || "";
			const branch = position.branch_id?.name || "";
			const employee = employeeByPositionId[id]?.employee || "";

			return {
				label: [branch, title, employee ? `(${employee})` : ""].filter(Boolean).join(" - "),
				value: id
			};
		})
		.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

		if (commitToStore) await storeValue("hrSupervisorPositionOptions", options, false);
		return options;
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
	}

}