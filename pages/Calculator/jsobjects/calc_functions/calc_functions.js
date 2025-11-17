export default {
	calculate () {
		var revenue;
		txt_debug.setText("Сумма перевозчику: " + curInp_carrier_sum.value + " руб., " + sel_carrierVAT.selectedOptionLabel +
											"\nКлиент платит: " + curInp_client_sum.value + " руб., " + sel_clientVAT.selectedOptionLabel);

		if (curInp_carrier_sum.value == null || curInp_client_sum.text == null || sel_carrierVAT.isValid == false || sel_clientVAT.isValid == false) {
			txt_result.setText("Введите обе суммы и оба варианта расчета");
			return
		}
		// Перевозчик с НДС, Клиент с НДС
		else if (sel_carrierVAT.value == 'VAT' && sel_clientVAT.value == 'VAT') {
			revenue = curInp_client_sum.value - curInp_carrier_sum.value;
		}
		// Перевозчик с НДС, Клиент без НДС
		else if (sel_carrierVAT.value == 'VAT' && sel_clientVAT.value == 'noVAT') {
			revenue = curInp_client_sum.value - (curInp_carrier_sum.value / 117 * 100);
		}
		// Перевозчик с НДС, Клиент с кэш
		else if (sel_carrierVAT.value == 'VAT' && sel_clientVAT.value == 'cash') {
			revenue = curInp_client_sum.value - (curInp_carrier_sum.value / 130 * 100);
		}
		// Перевозчик без НДС, Клиент с НДС
		else if (sel_carrierVAT.value == 'noVAT' && sel_clientVAT.value == 'VAT') {
			revenue = curInp_client_sum.value - (curInp_carrier_sum.value * 117 / 100);
		}
		// Перевозчик без НДС, Клиент без НДС
		else if (sel_carrierVAT.value == 'noVAT' && sel_clientVAT.value == 'noVAT') {
			revenue = curInp_client_sum.value - curInp_carrier_sum.value;
		}
		// Перевозчик без НДС, Клиент с кэш
		else if (sel_carrierVAT.value == 'noVAT' && sel_clientVAT.value == 'cash') {
			revenue = curInp_client_sum.value - (curInp_carrier_sum.value / 113 * 100);
		}
		// Перевозчик с кэш, Клиент с НДС
		else if (sel_carrierVAT.value == 'cash' && sel_clientVAT.value == 'VAT') {
			revenue = curInp_client_sum.value - (curInp_carrier_sum.value * 130 / 100);
		}
		// Перевозчик с кэш, Клиент без НДС
		else if (sel_carrierVAT.value == 'cash' && sel_clientVAT.value == 'noVAT') {
			revenue = curInp_client_sum.value - curInp_carrier_sum.value * 113 / 100;
		}
		// Перевозчик с кэш, Клиент с кэш
		else if (sel_carrierVAT.value == 'cash' && sel_clientVAT.value == 'cash') {
			revenue = curInp_client_sum.value - curInp_carrier_sum.value;
		}
		else {
			txt_result.setText("Что-то пошло не так, уведомьте, пожалуйста, разработчика support@osagent.ru");
			return
		}

		txt_result.setText("Получим чистую прибыль ~ " + Math.round(revenue) + " руб.");
		return
	},

	clearCarrierSum() {
		curInp_carrier_sum.setValue('');
		setTimeout(() => { calc_functions.calculate() }, 1);
		return
	},

	clearClientSum() {
		curInp_client_sum.setValue('');
		setTimeout(() => { calc_functions.calculate() }, 1);
		return
	}
}