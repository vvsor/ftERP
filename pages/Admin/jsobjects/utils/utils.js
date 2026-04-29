export default {
	/// ================== test block ==================
	// test: async () => {
	// },
	/// ============== end of test block ===============

	async getOfficeTerms({ commitToStore = true } = {}) {
		const branchId = appsmith.store?.salarySelectedBranchId ?? "";
		const periodMonth = appsmith.store?.periodMonth;


		const officeFilter = branchId
		? { position_id: { branch_id: { id: { _eq: branchId } } } }
		: {};

		const officeRes = await items.getItems({
			collection: "office_term",
			fields: [
				"id",
				"user_id",
				"user_id.id",
				"user_id.first_name",
				"user_id.last_name",
				"position_id",
				"position_id.title_id.title",
				"position_id.branch_id.id",
				"position_id.branch_id.name"
			].join(","),
			filter: officeFilter,
			limit: -1
		});

		const contacts = (officeRes.data || [])
		.map((item) => {
			const rawUser = item?.user_id;

			const user = typeof rawUser === "string"
			? { id: rawUser }
			: rawUser;

			const position = item?.position_id;
			const branch = position?.branch_id;

			if (!item?.id || !user?.id) {
				console.warn("Skipping malformed office_term", item);
				return null;
			}

			const firstInitial = user.first_name?.[0] ? ` ${user.first_name[0]}.` : "";

			return {
				id: item.id,
				user_id: user.id,
				employee: `${user.last_name || ""}${firstInitial}`.trim(),
				title: position?.title_id?.title ?? "—",
				branch_id: branch?.id ?? null,
				branch_name: branch?.name ?? "—"
			};
		})
		.filter(Boolean);

		const commitRows = async (rows) => {
			if (commitToStore) {
				await storeValue("salaryEmployeeRows", rows, false);
			}
			return rows;
		};

		const officeTermIds = contacts.map((x) => x.id);
		if (!periodMonth || officeTermIds.length === 0) {
			await storeValue("salaryByOfficeTermId", {}, false);
			return await commitRows(
				contacts.map((x) => ({ ...x, accruals_sum: 0, payments_sum: 0, balance: 0 }))
			);
		}


		const salaryRes = await items.getItems({
			collection: "salary",
			fields: [
				"*",
				"office_term_id.id"
			].join(","),
			filter: {
				_and: [
					{ period_month: { _eq: periodMonth } },
					{ office_term_id: { id: { _in: officeTermIds } } }
				]
			},
			limit: -1
		});

		const salaries = salaryRes.data || [];
		const getSalaryOfficeTermId = (s) => s?.office_term_id?.id ?? s?.office_term_id;

		const salaryByOfficeTermId = Object.fromEntries(
			salaries
			.map((s) => [getSalaryOfficeTermId(s), s])
			.filter(([officeTermId]) => officeTermId != null)
		);

		await storeValue("salaryByOfficeTermId", salaryByOfficeTermId, false);

		const salaryIds = salaries.map((s) => s.id).filter(Boolean);
		const officeBySalary = new Map(
			salaries.map((s) => [s.id, getSalaryOfficeTermId(s)])
		);

		if (salaryIds.length === 0) {
			await storeValue("salaryByOfficeTermId", {}, false);
			return await commitRows(
				contacts.map((c) => ({
					...c,
					accruals_sum: 0,
					payments_sum: 0,
					balance: 0
				}))
			);
		}

		const [accrRes, payRes] = await Promise.all([
			items.getItems({
				collection: "salary_accruals",
				fields: "salary_id.id,amount",
				filter: {
					_and: [
						{ salary_id: { id: { _in: salaryIds } } },
						{ deleted_at: { _null: true } }
					]
				},
				limit: -1
			}),
			items.getItems({
				collection: "salary_payments",
				fields: "salary_id.id,amount",
				filter: {
					_and: [
						{ salary_id: { id: { _in: salaryIds } } },
						{ deleted_at: { _null: true } }
					]
				},
				limit: -1
			})
		]);

		const accrByOffice = {};
		for (const r of (accrRes.data || [])) {
			const officeId = officeBySalary.get(r.salary_id?.id);
			if (!officeId) continue;
			accrByOffice[officeId] = (accrByOffice[officeId] || 0) + (Number(r.amount) || 0);
		}

		const payByOffice = {};
		for (const r of (payRes.data || [])) {
			const officeId = officeBySalary.get(r.salary_id?.id);
			if (!officeId) continue;
			payByOffice[officeId] = (payByOffice[officeId] || 0) + (Number(r.amount) || 0);
		}

		return await commitRows(
			contacts.map((c) => {
				const accruals_sum = accrByOffice[c.id] || 0;
				const payments_sum = payByOffice[c.id] || 0;
				return {
					...c,
					accruals_sum,
					payments_sum,
					balance: accruals_sum - payments_sum
				};
			})
		);
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

			await storeValue("salaryBranchRows", allBranches, true);
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

	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name;
		const first = user.first_name?.[0];
		return `${last} ${first}.`;
	}

}