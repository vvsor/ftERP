export default {
  createItems: async(params = {}) => {
    const { fields = "*", collection, filter = {}, body = {}, limit = -1 } = params;
    try {
      return await qCreateItems.run({ fields, filter, body, limit, collection });
    } catch (error) {
      console.error("Error in creating items in collection:", error);
      throw error;
    }
  },

  getItems: async(params = {}) => {
    const { fields = "*", collection, filter = {}, body = {}, limit = -1, token = null } = params;

    if (!collection) {
      throw new Error("collection is required");
    }

    try {
      return await qGetItems.run({ fields, filter, body, limit, collection, token });
    } catch (error) {
      console.error("Error in getting items in collection:", error);
      throw error;
    }
  }
}