export default {
	accrualsSummaryTextVisibleEmployees() {
		const tableRows = tbl_employees?.processedTableData ?? tbl_employees?.tableData;
		const rows = Array.isArray(tableRows) ? tableRows : [];
		const total = rows.reduce((sum, row) => sum + (Number(row.accruals_sum) || 0), 0);
		return `Начислено:  ${utils.formatCurrencyRu(total)}`;
	},

	paymentsSummaryTextVisibleEmployees() {
		const tableRows = tbl_employees?.processedTableData ?? tbl_employees?.tableData;
		const rows = Array.isArray(tableRows) ? tableRows : [];
		const total = rows.reduce((sum, row) => sum + (Number(row.payments_sum) || 0), 0);
		return `Выплачено:  ${utils.formatCurrencyRu(total)}`;
	},

	balanceSummaryTextVisibleEmployees() {
		const tableRows = tbl_employees?.processedTableData ?? tbl_employees?.tableData;
		const rows = Array.isArray(tableRows) ? tableRows : [];
		const total = rows.reduce(
			(sum, row) => sum + ((Number(row.accruals_sum) || 0) - (Number(row.payments_sum) || 0)),
			0
		);
		return `К выплате:  ${utils.formatCurrencyRu(total)}`;
	},

	getPaymentsSummaryPerson() {
		const accruals = tbl_salaryAccruals?.tableData || [];
		const payments = tbl_salaryPayments?.tableData || [];
		const sumByType = (rows, type) => rows.reduce(
			(sum, row) => sum + (String(row.branch_account_type || "").toUpperCase() === type ? (Number(row.amount) || 0) : 0),
			0
		);

		return {
			cashAccrued: sumByType(accruals, "CASH"),
			cashPaid: sumByType(payments, "CASH"),
			cashlessAccrued: sumByType(accruals, "CASHLESS"),
			cashlessPaid: sumByType(payments, "CASHLESS")
		};
	},

	accrualsSummaryTextPerson() {
		const summary = this.getPaymentsSummaryPerson();
		return `Безнал: ${utils.formatCurrencyRu(summary.cashlessAccrued)}. Наличными: ${utils.formatCurrencyRu(summary.cashAccrued)}`;
	},

	paymentsSummaryTextPerson() {
		const summary = this.getPaymentsSummaryPerson();
		return `Безналично: ${utils.formatCurrencyRu(summary.cashlessPaid)}. Наличными: ${utils.formatCurrencyRu(summary.cashPaid)}`;
	}
}