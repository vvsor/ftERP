export default {
	// updateClient: async () => {
	// showAlert('Обновляем данные клиента...', 'info');
	// let clientId = clients.selectedItem.id;
	// 
	// const BodyObj = {
	// name: inp_clientAddName.text,
	// description: inp_clientAddDescription.text,
	// supervisor_id: sel_clientAddSuperviser.selectedOptionValue,
	// date_updated: new Date().toISOString()
	// };
	// 
	// return qUpdateClient.run({
	// body: BodyObj,
	// clientId: clientId
	// })
	// .then(editedClient => {
	// clients.getClients();
	// utils.addAuditAction('client_edit', undefined, undefined, clients.selectedItem.id);
	// showAlert('Данные клиента обновлены!', 'success');
	// return;
	// })
	// .catch(error => {
	// // General catch for the entire operation
	// console.error("Error in client updating:", error);
	// throw error; // Re-throw to allow calling code to handle the error
	// });
	// }
}