export default {
	createItems: async(params = {}) => {
		const {fields, collection, filter = {}, body = {}, limit = -1	} = params;
		try {
			return qCreateItems.run({	fields, filter, body, limit, collection })
		} catch (error) {
			console.error("Error in creating items in collection:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	updateItems: async(params = {}) => {
		const {fields, collection, filter = {}, body = {}, limit = -1	} = params;

		// Validate required parameters
		if (!body || !collection) {
			throw new Error("Both 'body' and 'collection' must be defined.");
		}

		try {
			return await qUpdateItems.run({ fields, filter, body, limit, collection })
		} catch (error) {
			console.error("Error in getting items in collection:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	getItems: async(params = {}) => {
		const {fields, collection, filter = {}, body = {}, limit = -1	} = params;

		// Validate required parameters
		if (!fields || !collection) {
			throw new Error("Both 'fields' and 'collection' must be defined.");
		}

		try {
			return await qGetItems.run({ fields, filter, body, limit, collection })
		} catch (error) {
			console.error("Error in getting items in collection:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	},

	deleteItems: async(params ={}) => {
		const {fields, collection, filter = {}, body = {}, limit = -1	} = params;

		if ((!body || Object.keys(body).length === 0)) {
			throw new Error("You must specify body for deletion!");
		}

		try {
			return await qDeleteItems.run({	fields, filter, body, limit, collection })
		} catch (error) {
			console.error("Error in deleting items in collection:", error);
			throw error; // Re-throw to allow calling code to handle the error
		}
	}
}