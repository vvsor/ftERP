export default {

	defaultTab: 'Sign In',
	
	setDefaultTab: (newTab) => {
		this.defaultTab = newTab;
	},

	uploadFile: async () => {
		console.log("↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓");
		if (FilePicker1.files && FilePicker1.files.length > 0) {
			// FilePicker1.files.forEach( (file, index) => {
			for (var file of FilePicker1.files) {
				if (file) {
					storeValue("fileToUpload", file);
					FilePicker2.files[0] = file;
					console.log("file: ", file.name)
					console.log("FilePicker2.files[0]: ", FilePicker2.files[0].name)
					var r = await qUploadFile.run()
					.then( upload_result => { console.log("Uploaded: ", FilePicker2.files[0].name, FilePicker2.files[0].type) })
					.then( () => { resetWidget("FilePicker2") } )
					.then( () => { console.log("FilePicker2 resetted, now it's name: ", FilePicker2.files[0].name) } )

					// console.log(index, ": ", file.name," - type: ", typeof({data: file}));
					// console.log("size: ", file.size);
					// console.log("this.params.file: ", file );
					// console.log("FilePicker1.files[index]: ", FilePicker1.files[index] );
					// console.log("file: ", file.dataFormat );
					// rslt = qUploadFile.run(
					// {file: file, index: index}
					// ).then(result =>{
					// console.log("Upload successful:", result);
					// }).catch(error => {
					// console.error("Upload failed:", error);
					// return(error);
					// });
					} else {
						console.log("Skipping null file entry");
					}
			};
			// console.log("END of file list");
			console.log("⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆⬆");
			return("Upload successful: ", r);
		}
	},

	assign_file: () => {
		var file = FilePicker1.files[2];
		FilePicker2.files[0] = file;
		FilePicker2.setFiles
		//  FilePicker2.files = FilePicker1.files;

		FilePicker2.setVisibility(true);
		return FilePicker2.files[0];
	}
}
