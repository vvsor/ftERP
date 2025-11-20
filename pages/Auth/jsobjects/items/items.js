export default {
	createItems: async(params = {}) => {
		const {fields = "*", collection, filter = {}, body = {}, limit = -1	} = params;
		try {
			return await qCreateItems.run({	fields, filter, body, limit, collection })
		} catch (error) {
			console.error("Error in creating items in collection:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}