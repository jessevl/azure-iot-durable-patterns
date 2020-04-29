//
// PUT /api/zones/*id*/status
//
// Request body:
// 
//     {
//         "Distress": 1 [value between 1-5]
//     }
//
// Note: also sets broadcaster device in IoT Hub in case of distress. Disables broadcast device if no remaining distress zones.
//


const azure = require('azure-storage');
const iothub = require('azure-iothub');

const tableService = azure.createTableService(process.env["StorageConnection"]);
const partitionKey = process.env["zoneStatusPartition"];
const tableName = "zones";

module.exports = function (context, req) {
    context.log('Start ItemUpdate');


        if ((req.body.Distress) && (req.params.id)){
            const item = {
                RowKey: req.params.id,
                Distress: req.body.Distress,
                PartitionKey: partitionKey
            }

            tableService.replaceEntity(tableName, item, function (error, result, response) {
                if (!error) {
                    if ((req.body.Distress != 1) && (req.body.Distress !=0) ){
                        // Set the broadcaster device.
                        context.log('[%s] Twin (desired) needs update ', "clientSDK","broadcast");
        
                        var registry = iothub.Registry.fromConnectionString(process.env["uplinkClientConnectionString"]);
        
                        context.log('[%s] Get twin (desired)', "clientSDK","broadcast");
                        registry.getTwin("broadcast", function(err, twin){
                            if (err) {
                                context.log(err.constructor.name + ': ' + err.message);
                            } else {
                                var patch = {
                                    properties: {
                                        desired: {
                                            distress: true
                                        }
                                    }
                                };
                                context.log('[%s] Obtained twin (desired) for device ', "clientSDK","broadcast");
        
                                twin.update(patch, function(err) {
                                    if (err) {
                                    context.log('Could not update twin (desired): ' + err.constructor.name + ': ' + err.message);
                                    } else {
                                    context.log('[%s] Updated twin (desired) for device ', "clientSDK","broadcast");
                                    }
                                });
                            }
                        });
                    } else {
                        var query = new azure.TableQuery().top(1000).where("PartitionKey eq ? and Distress gt 1",partitionKey);
                        tableService.queryEntities(tableName, query, null, function (error, result, response) {
                            if(!error){
                                console.log(response.body.value);
                                if(!response.body.value[0]){
                                    console.log("no more zones in distress");
                                        
                                    // Set the broadcaster device.
                                        context.log('[%s] Twin (desired) needs update ', "clientSDK","broadcast");
                        
                                        var registry = iothub.Registry.fromConnectionString(process.env["uplinkClientConnectionString"]);
                        
                                        context.log('[%s] Get twin (desired)', "clientSDK","broadcast");
                                        registry.getTwin("broadcast", function(err, twin){
                                            if (err) {
                                                context.log(err.constructor.name + ': ' + err.message);
                                            } else {
                                                var patch = {
                                                    properties: {
                                                        desired: {
                                                            distress: false
                                                        }
                                                    }
                                                };
                                                context.log('[%s] Obtained twin (desired) for device ', "clientSDK","broadcast");
                        
                                                twin.update(patch, function(err) {
                                                    if (err) {
                                                    context.log('Could not update twin (desired): ' + err.constructor.name + ': ' + err.message);
                                                    } else {
                                                    context.log('[%s] Updated twin (desired) for device ', "clientSDK","broadcast");
                                                    }
                                                });
                                            }
                                        });
                                }

                                context.res.status(200);
                            } else {
                                context.res.status(500).json({error : error});
                            }
                        });
                    }
                    context.res.status(202).json(result);
                } else {
                    context.res.status(500).json({ error: error });
                }
            });


        } else {
            context.res.status(400);
            context.done();
        }

};