export default {
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
			: hrOfficeTerms.getCurrentOfficeTerms()
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
			: hrOfficeTerms.getCurrentOfficeTerms()
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
		const response = await items.getRoles({
			fields: "id,name",
			limit: -1
		});

		const rows = (response.data || [])
		.map((role) => ({
			label: role.name || role.id,
			value: role.id
		}))
		.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

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
			utils.getPolicies(),
			utils.getActivityAreaRows(),
			utils.getFunctionGroupRows(),
			utils.getDutyRows()
		]);
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

	async getActivityAreaRows({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "activity_areas",
			fields: "id,name",
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => ({ id: row.id, name: row.name || "" }))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

		if (commitToStore) await storeValue("hrActivityAreaRows", rows, false);
		return rows;
	},

	getPositionTitleOptions() {
		const rows = Array.isArray(appsmith.store?.hrPositionTitleRows) ? appsmith.store.hrPositionTitleRows : [];
		return rows.map((row) => ({ label: row.title || row.id, value: row.id }));
	},

	async getFunctionGroupRows({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "function_groups",
			fields: "*,activity_area_id.id,activity_area_id.name",
			limit: -1
		});

		const sortLevel = (value) => Number.isFinite(Number(value)) ? Number(value) : 999999;
		const rows = (response.data || [])
		.map((row) => {
			const activityAreaId = row.activity_area_id?.id ?? row.activity_area_id ?? null;
			const normalized = {
				id: row.id,
				name: row.name || "",
				activity_area_id: activityAreaId,
				activity_area_name: row.activity_area_id?.name || "",
				level: row.level ?? null
			};

			if (Object.prototype.hasOwnProperty.call(row, "description")) {
				normalized.description = row.description || "";
			}

			return normalized;
		})
		.sort((a, b) =>
					sortLevel(a.level) - sortLevel(b.level) ||
					String(a.activity_area_name || "").localeCompare(String(b.activity_area_name || "")) ||
					String(a.name || "").localeCompare(String(b.name || ""))
				 );

		if (commitToStore) await storeValue("hrFunctionGroupRows", rows, false);
		return rows;
	},

	async getDutyRows({ commitToStore = true } = {}) {
		const response = await items.getItems({
			collection: "duties",
			fields: [
				"id",
				"function_group_id.id",
				"function_group_id.name",
				"function_group_id.level",
				"function_group_id.activity_area_id.id",
				"function_group_id.activity_area_id.name",
				"position_title_id.id",
				"position_title_id.title"
			].join(","),
			limit: -1
		});

		const rows = (response.data || []).map((row) => {
			const functionGroup = row.function_group_id || {};
			const activityArea = functionGroup.activity_area_id || {};
			const positionTitle = row.position_title_id || {};

			return {
				id: row.id,
				function_group_id: functionGroup?.id ?? row.function_group_id ?? null,
				function_group_name: functionGroup?.name || "",
				function_group_level: functionGroup?.level ?? null,
				activity_area_id: activityArea?.id ?? functionGroup.activity_area_id ?? null,
				activity_area_name: activityArea?.name || "",
				position_title_id: positionTitle?.id ?? row.position_title_id ?? null,
				position_title: positionTitle?.title || ""
			};
		});

		if (commitToStore) await storeValue("hrDutyRows", rows, false);
		return rows;
	},

	getFunctionGroupTreeOptions() {
		const rows = Array.isArray(appsmith.store?.hrFunctionGroupRows) ? appsmith.store.hrFunctionGroupRows : [];
		const areas = new Map();

		for (const row of rows) {
			const areaKey = row.activity_area_id ? String(row.activity_area_id) : "__empty__";
			if (!areas.has(areaKey)) {
				areas.set(areaKey, {
					label: row.activity_area_name || "Без направления",
					value: `area:${areaKey}`,
					children: []
				});
			}

			areas.get(areaKey).children.push({
				label: row.name || row.id,
				value: row.id
			});
		}

		return [...areas.values()].map((area) => ({
			...area,
			children: area.children.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")))
		}));
	},

	getSelectedPositionFunctionGroupIds(positionTitleIdParam = null) {
		const positionTitleId = positionTitleIdParam || appsmith.store?.hrSelectedPosition?.position_title_id || null;
		const rows = Array.isArray(appsmith.store?.hrDutyRows) ? appsmith.store.hrDutyRows : [];
		if (!positionTitleId) return [];

		return [...new Set(
			rows
			.filter((row) => String(row.position_title_id || "") === String(positionTitleId))
			.map((row) => row.function_group_id)
			.filter(Boolean)
		)];
	},

	getSelectedPositionTitleId(positionTitleIdParam = null) {
		return positionTitleIdParam ?? appsmith.store?.hrSelectedPositionTitle?.id ?? null;
	},

	getSelectedPositionTitleFunctionGroupIds(positionTitleIdParam = null) {
		const positionTitleId = utils.getSelectedPositionTitleId(positionTitleIdParam);
		const rows = Array.isArray(appsmith.store?.hrDutyRows) ? appsmith.store.hrDutyRows : [];
		if (!positionTitleId) return [];

		return [...new Set(
			rows
			.filter((row) => String(row.position_title_id || "") === String(positionTitleId))
			.map((row) => row.function_group_id)
			.filter(Boolean)
		)];
	},

	getSelectedPositionTitleDutyRows(positionTitleIdParam = null) {
		const positionTitleId = utils.getSelectedPositionTitleId(positionTitleIdParam);
		const dutyRows = Array.isArray(appsmith.store?.hrDutyRows) ? appsmith.store.hrDutyRows : [];
		const functionGroupRows = Array.isArray(appsmith.store?.hrFunctionGroupRows) ? appsmith.store.hrFunctionGroupRows : [];
		const functionGroupsById = new Map(functionGroupRows.map((row) => [String(row.id), row]));
		const sortLevel = (value) => Number.isFinite(Number(value)) ? Number(value) : 999999;
		const seen = new Set();

		if (!positionTitleId) return [];

		return dutyRows
			.filter((row) => String(row.position_title_id || "") === String(positionTitleId))
			.filter((row) => {
			const key = String(row.function_group_id || "");
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		})
			.map((row) => {
			const functionGroup = functionGroupsById.get(String(row.function_group_id || "")) || {};
			return {
				activity_area_name: row.activity_area_name || functionGroup.activity_area_name || "Без направления",
				function_group_id: row.function_group_id,
				function_group_name: row.function_group_name || functionGroup.name || "",
				function_group_level: sortLevel(row.function_group_level ?? functionGroup.level),
				description: functionGroup.description || ""
			};
		})
			.sort((a, b) =>
						String(a.activity_area_name || "").localeCompare(String(b.activity_area_name || "")) ||
						a.function_group_level - b.function_group_level ||
						String(a.function_group_name || "").localeCompare(String(b.function_group_name || ""))
					 );
	},

	getSelectedPositionTitleDutiesText(positionTitleIdParam = null) {
		const positionTitleId = utils.getSelectedPositionTitleId(positionTitleIdParam);
		const rows = utils.getSelectedPositionTitleDutyRows(positionTitleId);
		if (!positionTitleId) return "Выберите должность";
		if (!rows.length) return "Обязанности не привязаны";

		const areas = new Map();
		for (const row of rows) {
			const areaName = row.activity_area_name || "Без направления";
			if (!areas.has(areaName)) areas.set(areaName, []);
			areas.get(areaName).push(row);
		}

		return [...areas.entries()]
			.map(([areaName, areaRows]) => [
			areaName,
			...areaRows.map((row) => `  ${row.function_group_name}`)
		].join("\n"))
			.join("\n\n");
	},

	getPositionTitleDutiesPreview(positionTitleIdParam = null) {
		const positionTitleId = positionTitleIdParam ?? null;
		if (!positionTitleId) return "";

		const rows = utils.getSelectedPositionTitleDutyRows(positionTitleId);
		if (!rows.length) return "Нет привязанных функционалов";

		const areas = new Map();

		for (const row of rows) {
			const areaName = row.activity_area_name || "Без направления";
			if (!areas.has(areaName)) areas.set(areaName, []);
			areas.get(areaName).push(row.function_group_name);
		}

		return [
			`Функционалов: ${rows.length}`,
			...[...areas.entries()].map(([areaName, functionNames]) =>
																	`${areaName} (${functionNames.length}): ${functionNames.filter(Boolean).join(", ")}`
																 )
		].join("\n");
	},

	getSelectedPositionTitleDutiesHtml(positionTitleIdParam = null) {
		const positionTitleId = utils.getSelectedPositionTitleId(positionTitleIdParam);
		const positionTitleRows = Array.isArray(appsmith.store?.hrPositionTitleRows) ? appsmith.store.hrPositionTitleRows : [];
		const selectedTitle =
					positionTitleRows.find((row) => String(row.id) === String(positionTitleId || "")) ||
					appsmith.store?.hrSelectedPositionTitle ||
					{};
		const title = selectedTitle.title || "Должность не выбрана";
		const rows = utils.getSelectedPositionTitleDutyRows(positionTitleId);
		const areas = new Map();

		for (const row of rows) {
			const areaName = row.activity_area_name || "Без направления";
			if (!areas.has(areaName)) areas.set(areaName, []);
			areas.get(areaName).push(row);
		}

		const content = !positionTitleId
		? '<p class="empty">Выберите должность.</p>'
		: rows.length
		? [...areas.entries()].map(([areaName, areaRows]) => `
				<section class="area">
					<div class="area-title">${utils.escapeHtml(areaName)}</div>
					${areaRows.map((row) => {
			const descriptionHtml = String(row.description || "").trim() || '<p class="empty">Описание не заполнено.</p>';
			return `
							<article class="functional">
								<div class="functional-title">${utils.escapeHtml(row.function_group_name)}</div>
								<div class="description">${descriptionHtml}</div>
							</article>
						`;
		}).join("")}
				</section>
			`).join("")
		: '<p class="empty">Для должности функционал не привязан.</p>';

		return `
			<!doctype html>
			<html lang="ru">
				<head>
					<meta charset="utf-8">
					<title>${utils.escapeHtml(title)}</title>
					<style>
						@page { margin: 14mm; }
						body { margin: 24px; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.45; color: #111; }
						h1 { margin: 0 0 16px; font-size: 18px; font-weight: 700; }
						.print-button { margin: 0 0 16px; padding: 6px 12px; border: 1px solid #999; background: #fff; cursor: pointer; }
						.area { margin: 14px 0 0; page-break-inside: avoid; }
						.area-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
						.functional { margin: 0 0 10px 18px; }
						.functional-title { margin: 0 0 4px; font-weight: 600; }
						.description { margin-left: 24px; }
						.description p { margin: 0 0 6px; }
						.empty { color: #777; font-style: italic; }
						@media print {
							body { margin: 0; }
							.print-button { display: none; }
						}
					</style>
				</head>
				<body>
					<button class="print-button" onclick="window.print()">Печать</button>
					<h1>${utils.escapeHtml(title)}</h1>
					${content}
				</body>
			</html>
		`;
	},

	getDutiesModalHtml() {
		return appsmith.store?.hrDutiesModalMode === "positionTitle"
			? utils.getSelectedPositionTitleDutiesHtml()
		: utils.getCurrentPositionDutiesHtml();
	},

	getDutiesModalTitle() {
		if (appsmith.store?.hrDutiesModalMode === "positionTitle") {
			const title = appsmith.store?.hrSelectedPositionTitle?.title || "Должность не выбрана";
			return `Должность: ${title}`;
		}

		const position = appsmith.store?.hrSelectedPosition || {};
		const title = position.title || "Должность не выбрана";
		const branch = position.branch_name || "Подразделение не указано";
		return `Должность: ${title}\nПодразделение: ${branch}`;
	},

	async refreshSelectedPositionTitleFunctionals(positionTitleIdParam = null) {
		const positionTitleId = utils.getSelectedPositionTitleId(positionTitleIdParam);
		if (!positionTitleId) {
			await storeValue("hrSelectedPositionTitleFunctionGroupIds", [], false);
			if (typeof mts_positionTitleFunctionals !== "undefined") resetWidget("mts_positionTitleFunctionals", true);
			return [];
		}

		if (!Array.isArray(appsmith.store?.hrDutyRows) || appsmith.store.hrDutyRows.length === 0) {
			await utils.getDutyRows();
		}

		const ids = utils.getSelectedPositionTitleFunctionGroupIds(positionTitleId);
		await storeValue("hrSelectedPositionTitleFunctionGroupIds", ids, false);
		if (typeof mts_positionTitleFunctionals !== "undefined") resetWidget("mts_positionTitleFunctionals", true);
		return ids;
	},

	escapeHtml(value = "") {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	},

	getCurrentPositionDutiesHtml() {
		const position = appsmith.store?.hrSelectedPosition || {};
		const positionTitleId = position.position_title_id || null;
		const positionTitle = position.title || "Текущая должность";
		const dutyRows = Array.isArray(appsmith.store?.hrDutyRows) ? appsmith.store.hrDutyRows : [];
		const functionGroupRows = Array.isArray(appsmith.store?.hrFunctionGroupRows) ? appsmith.store.hrFunctionGroupRows : [];
		const functionGroupsById = new Map(functionGroupRows.map((row) => [String(row.id), row]));
		const sortLevel = (value) => Number.isFinite(Number(value)) ? Number(value) : 999999;
		const seenFunctionGroups = new Set();

		const positionDuties = dutyRows
		.filter((row) => String(row.position_title_id || "") === String(positionTitleId || ""))
		.filter((row) => {
			const key = String(row.function_group_id || "");
			if (!key || seenFunctionGroups.has(key)) return false;
			seenFunctionGroups.add(key);
			return true;
		})
		.map((row) => {
			const functionGroup = functionGroupsById.get(String(row.function_group_id || "")) || {};
			return {
				activityAreaName: row.activity_area_name || functionGroup.activity_area_name || "Без направления",
				functionGroupName: row.function_group_name || functionGroup.name || "Без названия",
				functionGroupLevel: sortLevel(row.function_group_level ?? functionGroup.level),
				description: functionGroup.description || ""
			};
		})
		.sort((a, b) =>
					String(a.activityAreaName || "").localeCompare(String(b.activityAreaName || "")) ||
					a.functionGroupLevel - b.functionGroupLevel ||
					String(a.functionGroupName || "").localeCompare(String(b.functionGroupName || ""))
				 );

		const areas = [];
		const areasByName = new Map();

		for (const duty of positionDuties) {
			const areaName = duty.activityAreaName || "Без направления";
			if (!areasByName.has(areaName)) {
				const area = { name: areaName, duties: [] };
				areasByName.set(areaName, area);
				areas.push(area);
			}

			areasByName.get(areaName).duties.push(duty);
		}

		const content = !positionTitleId
		? '<p class="empty">Выберите должность.</p>'
		: areas.length
		? areas.map((area) => `
				<section class="area">
					<div class="area-title">${utils.escapeHtml(area.name)}</div>
					${area.duties.map((duty) => {
			const descriptionHtml = String(duty.description || "").trim() || '<p class="empty">Описание не заполнено.</p>';
			return `
							<article class="functional">
								<div class="functional-title">${utils.escapeHtml(duty.functionGroupName)}</div>
								<div class="description">${descriptionHtml}</div>
							</article>
						`;
		}).join("")}
				</section>
			`).join("")
		: '<p class="empty">Для должности функционал не привязан.</p>';

		return `
			<!doctype html>
			<html lang="ru">
				<head>
					<meta charset="utf-8">
					<title>${utils.escapeHtml(positionTitle)}</title>
					<style>
						@page { margin: 14mm; }
						body { margin: 24px; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.45; color: #111; }
						h1 { margin: 0 0 16px; font-size: 18px; font-weight: 700; }
						.print-button { margin: 0 0 16px; padding: 6px 12px; border: 1px solid #999; background: #fff; cursor: pointer; }
						.area { margin: 14px 0 0; page-break-inside: avoid; }
						.area-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
						.functional { margin: 0 0 10px 18px; }
						.functional-title { margin: 0 0 4px; font-weight: 600; }
						.description { margin-left: 24px; }
						.description p { margin: 0 0 6px; }
						.empty { color: #777; font-style: italic; }
						@media print {
							body { margin: 0; }
							.print-button { display: none; }
						}
					</style>
				</head>
				<body>
					<button class="print-button" onclick="window.print()">Печать</button>
					<h1>${utils.escapeHtml(positionTitle)}</h1>
					${content}
				</body>
			</html>
		`;
	},

	async refreshSelectedPositionFunctionals(positionTitleIdParam = null) {
		const positionTitleId = positionTitleIdParam || appsmith.store?.hrSelectedPosition?.position_title_id || null;
		if (!positionTitleId) {
			await storeValue("hrSelectedPositionFunctionGroupIds", [], false);
			resetWidget("mts_areasFunctional", true);
			return [];
		}

		if (!Array.isArray(appsmith.store?.hrDutyRows) || appsmith.store.hrDutyRows.length === 0) {
			await utils.getDutyRows();
		}

		const ids = utils.getSelectedPositionFunctionGroupIds(positionTitleId);
		await storeValue("hrSelectedPositionFunctionGroupIds", ids, false);
		resetWidget("mts_areasFunctional", true);
		return ids;
	},

	async getFunctionGroupDutyRows(functionGroupIdParam = null, { commitToStore = true } = {}) {
		const functionGroupId = functionGroupIdParam || appsmith.store?.hrSelectedFunctionGroup?.id || null;

		if (!functionGroupId) {
			if (commitToStore) {
				await storeValue("hrFunctionGroupDutyRows", [], false);
				await storeValue("hrSelectedFunctionGroupPositionIds", [], false);
			}
			return [];
		}

		const response = await items.getItems({
			collection: "duties",
			fields: "id,function_group_id.id,position_title_id.id,position_title_id.title",
			filter: { function_group_id: { id: { _eq: functionGroupId } } },
			limit: -1
		});

		const rows = (response.data || [])
		.map((row) => {
			const positionTitle = row.position_title_id || {};
			const functionGroup = row.function_group_id || {};
			return {
				id: row.id,
				function_group_id: functionGroup?.id ?? row.function_group_id ?? functionGroupId,
				position_title_id: positionTitle?.id ?? row.position_title_id ?? null,
				position_title: positionTitle?.title || ""
			};
		})
		.filter((row) => row.position_title_id)
		.sort((a, b) => String(a.position_title || "").localeCompare(String(b.position_title || "")));

		if (commitToStore) {
			await storeValue("hrFunctionGroupDutyRows", rows, false);
			await storeValue("hrSelectedFunctionGroupPositionIds", rows.map((row) => row.position_title_id), false);
		}

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