export default {
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
		const positionTitleId = hrDuties.getSelectedPositionTitleId(positionTitleIdParam);
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
		const positionTitleId = hrDuties.getSelectedPositionTitleId(positionTitleIdParam);
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
		const positionTitleId = hrDuties.getSelectedPositionTitleId(positionTitleIdParam);
		const rows = hrDuties.getSelectedPositionTitleDutyRows(positionTitleId);
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

		const rows = hrDuties.getSelectedPositionTitleDutyRows(positionTitleId);
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
		const positionTitleId = hrDuties.getSelectedPositionTitleId(positionTitleIdParam);
		const positionTitleRows = Array.isArray(appsmith.store?.hrPositionTitleRows) ? appsmith.store.hrPositionTitleRows : [];
		const selectedTitle =
					positionTitleRows.find((row) => String(row.id) === String(positionTitleId || "")) ||
					appsmith.store?.hrSelectedPositionTitle ||
					{};
		const title = selectedTitle.title || "Должность не выбрана";
		const rows = hrDuties.getSelectedPositionTitleDutyRows(positionTitleId);
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
					<div class="area-title">${hrDuties.escapeHtml(areaName)}</div>
					${areaRows.map((row) => {
			const descriptionHtml = String(row.description || "").trim() || '<p class="empty">Описание не заполнено.</p>';
			return `
							<article class="functional">
								<div class="functional-title">${hrDuties.escapeHtml(row.function_group_name)}</div>
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
					<title>${hrDuties.escapeHtml(title)}</title>
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
					<h1>${hrDuties.escapeHtml(title)}</h1>
					${content}
				</body>
			</html>
		`;
	},

	getDutiesModalHtml() {
		return appsmith.store?.hrDutiesModalMode === "positionTitle"
			? hrDuties.getSelectedPositionTitleDutiesHtml()
		: hrDuties.getCurrentPositionDutiesHtml();
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
		const positionTitleId = hrDuties.getSelectedPositionTitleId(positionTitleIdParam);
		if (!positionTitleId) {
			await storeValue("hrSelectedPositionTitleFunctionGroupIds", [], false);
			if (typeof mts_positionTitleFunctionals !== "undefined") resetWidget("mts_positionTitleFunctionals", true);
			return [];
		}

		if (!Array.isArray(appsmith.store?.hrDutyRows) || appsmith.store.hrDutyRows.length === 0) {
			await hrDuties.getDutyRows();
		}

		const ids = hrDuties.getSelectedPositionTitleFunctionGroupIds(positionTitleId);
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
					<div class="area-title">${hrDuties.escapeHtml(area.name)}</div>
					${area.duties.map((duty) => {
			const descriptionHtml = String(duty.description || "").trim() || '<p class="empty">Описание не заполнено.</p>';
			return `
							<article class="functional">
								<div class="functional-title">${hrDuties.escapeHtml(duty.functionGroupName)}</div>
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
					<title>${hrDuties.escapeHtml(positionTitle)}</title>
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
					<h1>${hrDuties.escapeHtml(positionTitle)}</h1>
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
			await hrDuties.getDutyRows();
		}

		const ids = hrDuties.getSelectedPositionFunctionGroupIds(positionTitleId);
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
	}	
}