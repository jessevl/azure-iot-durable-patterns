//
// GET /api/zones/status
//
// Response:
// [
//     {
//         "ZoneId": "1",
//         "Distress": 1
//     },
//     ...
// ]
//


const azure = require('azure-storage');

const tableService = azure.createTableService(process.env["StorageConnection"]);
const partitionKey = process.env["zoneStatusPartition"];
const tableName = "zones";

module.exports = function (context, req) {
    context.log('Start Zones Read');

        // return the top x items
        var query = new azure.TableQuery().top(1000).where('PartitionKey eq ?', partitionKey);
        tableService.queryEntities(tableName, query, null, function (error, result, response) {
            if(!error){
                
                var res = [];

                response.body.value.forEach(zone => {
                    res.push({
                        ZoneId: zone.RowKey,
                        Distress: zone.Distress
                    })
                
                });
                context.res.status(200).json(res);
            } else {
                context.res.status(500).json({error : error});
            }
        });
};