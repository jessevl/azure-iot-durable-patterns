//
// PUT /api/zones
//
// Request: GeoJSON FeatureCollection with Geometry type Polygon features.
//
// Note: this also adds any non-existing zones to the status table (with distress status 0), and deletes ones that are not in the GeoJSON.
//

const azure = require('azure-storage');

var blobService = azure.createBlobService(process.env["StorageConnection"]);
const path = process.env["zoneDefinitionPath"].split("/");
const container = path[0];
const file = path[1];

const tableService = azure.createTableService(process.env["StorageConnection"]);
const partitionKey = process.env["zoneStatusPartition"];
const tableName = "zones";

module.exports = function (context, req) {
    context.log('Start Zone definitions Write');

    if (req.body.type == "FeatureCollection"){

        // upload blob
        blobService.createBlockBlobFromText(container, file, JSON.stringify(req.body), function(err) {
            if (err) {
                console.error("Couldn't download blob %s", file);
                context.res.status(500).json({error : err});
            } else {
                console.log("Sucessfully uploaded blob %s", file);
                
                    // get table with zone status and compare with new GeoJSON
                    var query = new azure.TableQuery().top(1000).where('PartitionKey eq ?', partitionKey);
                    tableService.queryEntities(tableName, query, null, function (error, result, response) {
                    if(!error){
                        var zoneTable = [];
                        var zoneFeatures = [];

                        response.body.value.forEach(zone => {
                            zoneTable.push(parseInt(zone.RowKey))
                        });

                        req.body.features.forEach(feature => {
                            zoneFeatures.push(parseInt(feature.properties.id))
                        })

                        var toCreate = zoneFeatures.filter(d => !zoneTable.includes(d));
                        var toDelete = zoneTable.filter(d => !zoneFeatures.includes(d));
                        
                        context.log("Create new zones in table"+toCreate);
                        context.log("Delete zones from table:"+toDelete);

                        toCreate.forEach(zone => {
                            const item = {
                                RowKey: {'_': zone.toString()},
                                Distress: {'_': 0},
                                PartitionKey: {'_': partitionKey}
                            }

                            tableService.insertEntity(tableName, item, function (error, result, response) {
                                if (error) {
                                    context.res.status(500).json({ error: error });
                                }
                            });
                        });

                        toDelete.forEach(zone => {
                            const item = {
                                RowKey: {'_': zone.toString()},
                                PartitionKey: {'_': partitionKey}
                            }

                            tableService.deleteEntity(tableName, item, function (error, result, response) {
                                if (error){
                                    context.res.status(500).json({error : error});
                                }
                            });
                        });

                    } else {
                        context.res.status(500).json({error : error});
                    }
                }); 
      

                context.res.status(200);
                context.done();
            }
          });


    } else {
        context.res.status(400).body("Not a valid featurecollection");
    }


};