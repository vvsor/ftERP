export default {
  menuItems() {
    return appsmith.store?.appMenuItems || [];
  },

  open(item) {
    if (!item?.navigationTarget) return;

    navigateTo(
      item.navigationTarget,
      {},
      item.target || "SAME_WINDOW"
    );
  }
}