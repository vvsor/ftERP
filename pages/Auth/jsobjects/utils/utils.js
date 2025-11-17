export default {
	formatUserName(user) {
		if (!user) return "";
		const last = user.last_name;
		const first = user.first_name?.[0];
		return `${last} ${first}.`;
	},
	loadPersistedStore(){
		Text3.setText(JSON.parse(localStorage.getItem("appsmith-persisted-store") || "{}"));
	}
}