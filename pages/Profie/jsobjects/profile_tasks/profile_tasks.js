export default {
	myVar1: [],
	myVar2: {},
	myFun1 () {
		//	write code here
		//	this.myVar1 = [1,2,3]
	},

	connectTelegram: async () => {
		// const allTasks = await getAllTasks.run();
		// const today = new Date().toISOString().slice(0, 10); // Extract YYYY-MM-DD part
		// const todaysTasks = allTasks.filter((task) => task.created_at.startsWith(today));
		// 
		// const incompleteTasks = todaysTasks.filter(t => t.is_complete === false);
		// 
		// // Sort the todaysTasks array by the 'created_at' date in descending order
		// incompleteTasks.sort((a, b) => b.created_at.localeCompare(a.created_at));
		// let user_hash = (Math.random()+1).toString(36).substring(2);
		let user_hash = "qweasd2";
		navigateTo('https://telegram.me/NewFT_bot?start='+user_hash, {}, 'NEW_WINDOW');
		// showAlert('Телеграмм подключен', 'success');
		return
	},



}