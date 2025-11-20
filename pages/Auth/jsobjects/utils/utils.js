export default {
	formatUserName(user) {
		if (!user) return "";
		return `${user.last_name} ${user.first_name?.[0] ?? ''}.`;
	}
}