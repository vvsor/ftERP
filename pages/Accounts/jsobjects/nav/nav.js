export default {
	async loadAppPages() {
		const res = await items.getItems({
			collection: "app_pages",
			fields: [
				"code", "title", "appsmith_page", "url",
				"target", "menu_icon", "show_in_menu", "sort"
			].join(","),
			limit: -1
		});

		const pages = (res?.data || [])
		.map((p) => {
			const code = String(p.code || "").trim().toLowerCase();
			const title = String(p.title || code).trim();
			const appsmithPage = String(p.appsmith_page || "").trim();
			const url = String(p.url || "").trim();

			return {
				code,
				title,
				appsmith_page: appsmithPage || null,
				url: url || null,
				target: p.target || "SAME_WINDOW",
				menu_icon: p.menu_icon || "",
				show_in_menu: p.show_in_menu !== false,
				sort: Number(p.sort) || 0,
				label: title,
				text: title,
				value: code,
				iconName: p.menu_icon || "",
				navigationTarget: url || appsmithPage
			};
		})
		.filter((p) => p.code)
		.sort((a, b) => a.sort - b.sort);

		await storeValue("appPages", pages, true);
		await storeValue("appPageCodes", pages.map((p) => p.code), true);
		await storeValue("appMenuItems", pages.filter((p) => p.show_in_menu && p.navigationTarget), true);

		return pages;
	},

	async hasPage(code) {
		const pageCode = String(code || "").trim().toLowerCase();
		let pageCodes = appsmith.store?.appPageCodes || [];

		if (!pageCodes.includes(pageCode)) {
			const pages = await nav.loadAppPages();
			pageCodes = pages.map((p) => p.code);
		}

		return pageCodes.includes(pageCode);
	},

	menuItems(currentPageCode = "") {
		const currentCode = String(currentPageCode || "").trim().toLowerCase();

		const items = (appsmith.store?.appMenuItems || [])
		.filter((item) => String(item.code || "").toLowerCase() !== currentCode);

		return [
			...items,
			{
				code: "logout",
				text: "Выйти",
				label: "Выйти",
				value: "logout",
				iconName: "log-out",
				action: "logout"
			}
		];
	},

	open(item) {
		if (item?.action === "logout") {
			if (typeof auth !== "undefined" && auth.logout) return auth.logout();

			clearStore();
			showAlert("Успешный выход", "success");
			navigateTo("Auth");
			return;
		}

		if (!item?.navigationTarget) return;

		navigateTo(
			item.navigationTarget,
			{},
			item.target || "SAME_WINDOW"
		);
	}
}