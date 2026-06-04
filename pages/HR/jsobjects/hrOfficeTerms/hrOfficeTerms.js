export default {
	currentOfficeTermsPromise: null,

	async getCurrentOfficeTerms({ commitToStore = true } = {}) {
		if (!this.currentOfficeTermsPromise) {
			this.currentOfficeTermsPromise = (async () => {
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

				return response.data || [];
			})();
		}

		const request = this.currentOfficeTermsPromise;

		try {
			const rows = await request;
			if (commitToStore) await storeValue("hrCurrentOfficeTerms", rows, false);
			return rows;
		} finally {
			if (this.currentOfficeTermsPromise === request) {
				this.currentOfficeTermsPromise = null;
			}
		}
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
				is_current: isCurrent
			};
		})
		.sort((a, b) => {
			if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
			return String(b.date_from || "").localeCompare(String(a.date_from || ""));
		});

		if (commitToStore) await storeValue(storeKey, rows, false);
		return rows;
	},

	normalizeTableRow(row) {
		return { ...(row?.allFields || row || {}), ...(row?.updatedFields || {}) };
	},

	getCreatedRecordId(response) {
		return response?.data?.id || response?.id || null;
	},

	formatDateValue(value) {
		return value ? moment(value).format("YYYY-MM-DD") : null;
	},

	datesOverlap(startA, endA, startB, endB) {
		const aStart = moment(startA);
		const aEnd = endA ? moment(endA) : moment("9999-12-31");
		const bStart = moment(startB);
		const bEnd = endB ? moment(endB) : moment("9999-12-31");

		return aStart.isSameOrBefore(bEnd, "day") && bStart.isSameOrBefore(aEnd, "day");
	},

	async createOfficeTermAssignment({ user_id, position_id, date_from, comment = "" } = {}) {
		const body = {
			user_id,
			position_id,
			date_from: this.formatDateValue(date_from),
			date_till: null,
			comment
		};

		await this.validateOfficeTermPeriod({ id: null, ...body });
		return await items.createItems({ collection: "office_terms", body });
	},

	async validatePositionAvailableForAssignment({ position_id, date_from, date_till = null } = {}) {
		if (!position_id) throw new Error("Выберите должность");
		if (!date_from) throw new Error("Укажите дату начала");

		const response = await items.getItems({
			collection: "office_terms",
			fields: "id,position_id.id,date_from,date_till",
			filter: { position_id: { id: { _eq: position_id } } },
			limit: -1
		});

		for (const term of (response.data || [])) {
			if (this.datesOverlap(date_from, date_till, term.date_from, term.date_till)) {
				throw new Error("Должность уже занята другим сотрудником в указанный период");
			}
		}
	},

	async validateOfficeTermPeriod({ id, user_id, position_id, date_from, date_till }) {
		if (!user_id) throw new Error("Выберите сотрудника");
		if (!position_id) throw new Error("Выберите должность");
		if (!date_from) throw new Error("Укажите дату начала");
		if (date_till && moment(date_till).isBefore(moment(date_from), "day")) {
			throw new Error("Дата окончания не может быть раньше даты начала");
		}

		const response = await items.getItems({
			collection: "office_terms",
			fields: "id,user_id.id,position_id.id,date_from,date_till",
			filter: {
				_or: [
					{ user_id: { id: { _eq: user_id } } },
					{ position_id: { id: { _eq: position_id } } }
				]
			},
			limit: -1
		});

		for (const term of (response.data || [])) {
			if (String(term.id) === String(id)) continue;

			const termUserId = term?.user_id?.id ?? term?.user_id;
			const termPositionId = term?.position_id?.id ?? term?.position_id;
			const overlaps = this.datesOverlap(date_from, date_till, term.date_from, term.date_till);

			if (!overlaps) continue;

			if (String(termUserId) === String(user_id) && String(termPositionId) === String(position_id)) {
				throw new Error("У сотрудника уже есть назначение на эту должность в указанный период");
			}

			if (String(termPositionId) === String(position_id)) {
				throw new Error("Должность уже занята другим сотрудником в указанный период");
			}
		}
	},

	async saveOfficeTermHistory(rowParam = null, historyModeParam = null) {
		const historyMode = historyModeParam || appsmith.store?.hrOfficeTermHistoryMode || "position";
		await storeValue("hrOfficeTermHistoryMode", historyMode, true);
		const historyTable = historyMode === "employee" ? tbl_EmployeeOfficeTermHistory : tbl_officeTermHistory;
		const rawRow =
					rowParam ||
					(historyTable.isAddRowInProgress
					 ? historyTable.newRow
					 : (historyTable.updatedRows?.[0] || historyTable.updatedRow || historyTable.selectedRow));

		const row = this.normalizeTableRow(rawRow);
		const selectedUserId =
					row.user_id ||
					(historyMode === "employee" ? appsmith.store?.hrSelectedEmployeeRow?.user_id : null) ||
					appsmith.store?.hrSelectedPosition?.user_id;

		const selectedPositionId =
					historyMode === "position"
		? appsmith.store?.hrSelectedPosition?.id
		: null;

		const officeTermId = row.office_term_id || row.id || null;
		const body = {
			user_id: selectedUserId,
			position_id: selectedPositionId || row.position_id || null,
			date_from: row.date_from ? moment(row.date_from).format("YYYY-MM-DD") : null,
			date_till: row.date_till ? moment(row.date_till).format("YYYY-MM-DD") : null,
			comment: row.comment || ""
		};

		try {
			await this.validateOfficeTermPeriod({ id: officeTermId, ...body });

			if (officeTermId) {
				await items.updateItems({
					collection: "office_terms",
					body: { keys: [officeTermId], data: body }
				});
			} else {
				await items.createItems({ collection: "office_terms", body });
			}

			resetWidget(historyMode === "employee" ? "tbl_EmployeeOfficeTermHistory" : "tbl_officeTermHistory", true);
			await Promise.all([
				hrPositions.refreshPositionsPage({ notify: false }),
				hrEmployees.refreshEmployeesPage({ notify: false })
			]);

			showAlert("Назначение сохранено", "success");
		} catch (error) {
			showAlert(error?.message || "Ошибка сохранения назначения", "warning");
			throw error;
		}
	}
}