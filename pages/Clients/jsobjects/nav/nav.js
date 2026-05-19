export default {
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