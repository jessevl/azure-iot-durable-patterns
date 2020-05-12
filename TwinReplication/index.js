module.exports = async function (context, myEventHubMessage) {    

    // Define and create Cosmos DB Client
    const endpoint = process.env["tripletDBendpoint"];
    const key = process.env["tripletDBkey"];
     
    const CosmosClient = require('@azure/cosmos').CosmosClient;
    const client = new CosmosClient({ endpoint, key });
    
    const databaseId = process.env["tripletDBname"];
    const containerId = process.env["tripletDBcontainer"];
    const partitionKey = { kind: "Hash", paths: ["/deviceid"] };
   
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    const { container } = await database.containers.createIfNotExists({ id: containerId });


       // Start Message processing
       for(var i = 0; i < myEventHubMessage.length; i++) {
       
        // pick up device id from system properties
        var deviceid = context.bindingData.systemPropertiesArray[i]["iothub-connection-device-id"];
        var eventType = context.bindingData.propertiesArray[i]["opType"];

        // Either the desired or reported var is set based on the event message
        var newDesired = myEventHubMessage[i]["properties"]["desired"];
        var newReported = myEventHubMessage[i]["properties"]["reported"];

        context.log("The following event happened: " + eventType + " for device " + deviceid);

        // Update event message with id, deviceid and eventType
        var updatedDeviceDetails = myEventHubMessage[i];  
        updatedDeviceDetails["id"] = deviceid;      
        updatedDeviceDetails["deviceid"] = deviceid;
        updatedDeviceDetails["eventType"] = eventType;
        

        // query documents in cosmos db to find existing device
        const querySpec = {            
            query: `SELECT * FROM c WHERE c.id = '${deviceid}'`        
        };    
        
        const { resources: items } = await container.items
        .query(querySpec)
        .fetchAll();

        // Update existing document with the new desired or reported properties 
        items.forEach(item => {
            
            // defined the old existing properties
            var oldDesired = item.properties.desired;
            var oldReported = item.properties.reported;
            
            // if there is a new desired property -->
            if(newDesired !== undefined) {      

                context.log("Need to update the desired properties");
                updatedDeviceDetails["properties"]["desired"] = newDesired;

                // leave the old reported property as is (if it exists)
                if(oldReported !== undefined) {
                updatedDeviceDetails["properties"]["reported"] = oldReported;
                } else {
                };
                
                // update the document
                container.items.upsert(updatedDeviceDetails, partitionKey);
                context.log("Desired properties updated");
    
            // if there is a new reported property -->
            } else if(newReported !== undefined) {

                context.log("Need to update the reported properties");
                
                // leave the old desired property as is (if it exists)
                if(oldDesired !== undefined) {
                updatedDeviceDetails["properties"]["desired"] = oldDesired;
                } else {
                };
                
                // update the document
                updatedDeviceDetails["properties"]["reported"] = newReported;
                container.items.upsert(updatedDeviceDetails, partitionKey);
                context.log("Reported properties updated");

            } else {
                context.log("Nothing was updated")
            };


        });    
      
    }


};

