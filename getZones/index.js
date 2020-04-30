//
// GET /api/zones
//
// Response: GeoJSON
//


const azure = require('azure-storage');
const blobService = azure.createBlobService(process.env["StorageConnection"]);
const path = process.env["zoneDefinitionPath"].split("/");
const container = path[0];
const file = path[1];

module.exports = function (context, req) {
    context.log('Start Zone definitions Read');

    blobService.getBlobToText(container, file, function(err, result, response) {
        if (err) {
            console.error("Couldn't download blob %s", file);
            context.res.status(500).json({error : err});
        } else {
            console.log("Sucessfully downloaded blob %s", file);
            context.res.status(200).json(result);
        }
    });

};